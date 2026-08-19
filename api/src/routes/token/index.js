const SOL_MINT = 'So11111111111111111111111111111111111111112';

async function tokenRoutes (fastify, options) {
  fastify.get('/:mint', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { mint } = request.params;
    if (!mint) {
      return reply.code(400).send({ message: 'token mint is required' });
    }

    fastify.log.info({ mint }, 'fetching token metadata and price');

    const { HELIUS_API_KEY } = process.env;
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
    const transactionsUrl = `https://api.helius.xyz/v0/addresses/${mint}/transactions?api-key=${HELIUS_API_KEY}&limit=1&type=SWAP`;
    const jupiterSearchUrl = `https://lite-api.jup.ag/ultra/v1/search?query=${mint}`;

    try {
      const [assetCall, transactionsCall, jupiterSearchCall] = await Promise.all([
        fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'axton-api-asset',
            method: 'getAsset',
            params: { id: mint }
          })
        }),
        fetch(transactionsUrl),
        fetch(jupiterSearchUrl)
      ]);

      if (!assetCall.ok || !transactionsCall.ok || !jupiterSearchCall.ok) {
        throw new Error('Failed to fetch data from one or more external APIs');
      }

      const assetData = await assetCall.json();
      const transactionsData = await transactionsCall.json();
      const jupiterSearchData = await jupiterSearchCall.json();

      if (assetData.error || !assetData.result) {
        return reply.code(404).send({ message: 'Token not found on-chain' });
      }

      const { id, content, token_info: tokenInfo } = assetData.result;
      const response = {
        address: id,
        name: content?.metadata?.name,
        symbol: content?.metadata?.symbol,
        image: content?.links?.image,
        decimals: tokenInfo.decimals,
        price_info: null,
        source: null,
        market_cap: null,
        volume_24h: null,
        liquidity: null
      };

      const jupiterTokenData = jupiterSearchData?.[0];
      if (jupiterTokenData) {
        const solPriceUrl = `https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`; // CORRECTED to legacy price endpoint
        const solPriceResponse = await fetch(solPriceUrl);
        const solPriceData = await solPriceResponse.json();
        const solPriceUsd = solPriceData[SOL_MINT]?.usdPrice || 0;

        const priceUsd = jupiterTokenData.usdPrice; // Mapped from 'usdPrice'
        response.price_info = {
          price_per_token: solPriceUsd > 0 ? priceUsd / solPriceUsd : 0,
          currency: 'SOL',
          price_usd: priceUsd
        };

        const mcapUsd = jupiterTokenData.mcap; // Mapped from 'mcap'
        if (mcapUsd) {
          response.market_cap = {
            valueUsd: mcapUsd,
            valueSol: solPriceUsd > 0 ? mcapUsd / solPriceUsd : 0
          };
        }

        if (jupiterTokenData.liquidity !== undefined) { // Mapped from 'liquidity'
          response.liquidity = {
            valueUsd: jupiterTokenData.liquidity,
            valueSol: solPriceUsd > 0 ? jupiterTokenData.liquidity / solPriceUsd : 0
          };
        }

        if (jupiterTokenData.stats24h) { // Mapped from 'stats24h'
          const volumeUsd = jupiterTokenData.stats24h.buyVolume + jupiterTokenData.stats24h.sellVolume;
          response.volume_24h = {
            valueUsd: volumeUsd,
            valueSol: solPriceUsd > 0 ? volumeUsd / solPriceUsd : 0
          };
        }
      }

      if (transactionsData && transactionsData.length > 0) {
        response.source = transactionsData[0].source;
      }

      return response;
    } catch (err) {
      fastify.log.error(err, 'error fetching token data');
      return reply.code(500).send({ message: 'error fetching token data' });
    }
  });
}

export default tokenRoutes;
