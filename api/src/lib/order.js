const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Retrieves the wallet (public key and encrypted private key) for a given account.
 * Throws a specific error if the wallet is not found.
 * @param {object} fastify - The Fastify instance for logging.
 * @param {object} client - The database client.
 * @param {string} accountId - The account ID.
 * @returns {Promise<object>} The wallet information.
 */
export async function getWalletForOrder (fastify, client, accountId) {
  fastify.log.info({ accountId }, 'getting wallet info for order');
  const accountResult = await client.query(
    'SELECT public_key, private_key_encrypted FROM account WHERE id = $1',
    [accountId]
  );

  if (accountResult.rows.length === 0 || !accountResult.rows[0].public_key) {
    const err = new Error('Cannot create order, wallet not found');
    err.statusCode = 409; // Conflict
    throw err;
  }
  return accountResult.rows[0];
}

/**
 * Builds the database record and SQS message for a new order based on its type.
 * @param {object} fastify - The Fastify instance for logging.
 * @param {string} type - The order type ('OneShotBuy', 'OneShotSell', 'Countersell').
 * @param {object} body - The request body containing order parameters.
 * @param {object} tokenData - The metadata for the token being traded.
 * @param {string} accountId - The account ID placing the order.
 * @returns {Promise<{dbRecord: object, sqsMessage: object}>} The DB record and SQS message.
 */
export async function buildOrderContext (fastify, type, body, tokenData, accountId) {
  fastify.log.info({ type }, 'building order context');

  const lamportsPerSol = 1_000_000_000;
  let dbRecord, sqsMessage;

  if (type === 'OneShotBuy' || type === 'OneShotSell') {
    const { amount_sol: amountSol, amount_tokens: amountTokens } = body;

    const config = {
      request_amount_lamports: type === 'OneShotBuy' ? Math.round(amountSol * lamportsPerSol) : null,
      request_amount_microtokens: type === 'OneShotSell' ? Math.round(amountTokens * 10 ** tokenData.decimals) : null,
      slippage_pct_bps: 3000
    };

    dbRecord = {
      text: 'INSERT INTO position_order (account_id, token_mint, type, config) VALUES ($1, $2, $3, $4) RETURNING id',
      values: [accountId, tokenData.mint, type, config]
    };

    sqsMessage = {
      order_type: type,
      slippage_bps: config.slippage_pct_bps
    };
    if (type === 'OneShotBuy') {
      sqsMessage.token_to_buy = tokenData.mint;
      sqsMessage.sol_amount = config.request_amount_lamports;
    } else {
      sqsMessage.token_to_sell = tokenData.mint;
      sqsMessage.token_amount = config.request_amount_microtokens;
    }
  } else if (type === 'Countersell') {
    const {
      initial_tokens: initialTokens,
      max_percentage_to_sell: maxPercentageToSell,
      target_mcap_usd: targetMcapUsd,
      buy_threshold_sol: buyThresholdSol,
      sell_percentage: sellPercentage
    } = body;

    const requiredFields = { initialTokens, maxPercentageToSell, targetMcapUsd, buyThresholdSol, sellPercentage };
    for (const [key, val] of Object.entries(requiredFields)) {
      if (typeof val !== 'number') throw new Error(`${key} is required and must be a number`);
    }

    // convert all token amounts from the ui into microtokens
    const initialMicrotokens = Math.round(initialTokens * 10 ** tokenData.decimals);
    const maxToSellMicrotokens = Math.round(initialMicrotokens * (maxPercentageToSell / 100));

    // get exchange rate to convert all usd amounts from the ui into sol
    const solPriceUrl = `https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`;
    const solPriceResponse = await fetch(solPriceUrl);
    if (!solPriceResponse.ok) {
      fastify.log.error({ status: solPriceResponse.status }, 'failed to fetch SOL price');
      throw new Error('failed to fetch SOL price');
    }
    const solPriceData = await solPriceResponse.json();
    const solPriceUsd = solPriceData[SOL_MINT]?.usdPrice;
    if (!solPriceUsd) {
      fastify.log.error({ solPriceData }, 'sol price not found in jupiter response');
      throw new Error('failed to get SOL price from jupiter api');
    }
    fastify.log.info({ solPriceUsd }, 'fetched sol price');
    const targetMcapSol = targetMcapUsd / solPriceUsd;

    // then convert all sol amounts into lamports
    const targetMcapLamports = Math.round(targetMcapSol * lamportsPerSol);
    const buyThresholdLamports = Math.round(buyThresholdSol * lamportsPerSol);

    const config = {
      initial_microtokens: initialMicrotokens,
      max_to_sell_microtokens: maxToSellMicrotokens,
      mcap_threshold_lamports: targetMcapLamports,
      buy_threshold_lamports: buyThresholdLamports,
      sell_pct_bps: Math.round(sellPercentage * 100)
    };

    dbRecord = {
      text: 'INSERT INTO position_order (account_id, token_mint, type, token_amount_microtokens, config) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      values: [accountId, tokenData.mint, type, 0, config]
    };

    sqsMessage = {
      order_type: type,
      token_to_monitor: tokenData.mint,
      initial_holdings_microtokens: config.initial_microtokens,
      max_to_sell_microtokens: config.max_to_sell_microtokens,
      mcap_threshold_lamports: config.mcap_threshold_lamports,
      buy_threshold_lamports: config.buy_threshold_lamports,
      sell_pct_bps: config.sell_pct_bps
    };
  } else {
    throw new Error(`Unsupported order type: ${type}`);
  }

  return { dbRecord, sqsMessage };
}
