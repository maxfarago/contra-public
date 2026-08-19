/**
 * Fetches token metadata. First checks the local database.
 * If not found, fetches from Helius API and saves the result to the database.
 * @param {object} fastify - The Fastify instance for logging.
 * @param {object} client - The database client.
 * @param {string} mint - The token mint address.
 * @returns {Promise<object>} The token metadata.
 */
export async function getToken (fastify, client, mint) {
  fastify.log.info({ mint }, 'getting token data');
  const tokenResult = await client.query('SELECT * FROM token WHERE mint = $1', [mint]);

  if (tokenResult.rows.length > 0) {
    fastify.log.info({ mint }, 'token found in db');
    return tokenResult.rows[0];
  }

  fastify.log.info({ mint }, 'token not found in db, fetching from helius');
  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  const assetCall = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'axton-api-asset',
      method: 'getAsset',
      params: { id: mint }
    })
  });
  const assetData = await assetCall.json();

  if (assetData.error || !assetData.result) {
    fastify.log.error({ error: assetData.error }, 'helius getasset api error');
    throw new Error('failed to fetch token metadata');
  }

  const { content, token_info: tokenInfo } = assetData.result;
  const newToken = {
    mint,
    name: content?.metadata?.name,
    symbol: content?.metadata?.symbol,
    image_url: content?.links?.image,
    decimals: tokenInfo?.decimals || 0
  };

  await client.query(
    'INSERT INTO token (mint, name, symbol, image_url, decimals) VALUES ($1, $2, $3, $4, $5)',
    [newToken.mint, newToken.name, newToken.symbol, newToken.image_url, newToken.decimals]
  );
  fastify.log.info({ token: newToken }, 'new token metadata saved');
  return newToken;
}
