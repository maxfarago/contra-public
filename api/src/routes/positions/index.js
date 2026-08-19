
const SOL_MINT = 'So11111111111111111111111111111111111111112';

async function positionsRoutes (fastify, options) {
  // LIST all positions
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: accountId } = request.user;
    const client = await fastify.db.connect();

    try {
      // 1. Fetch all positions from the database
      const positionQuery = `
        SELECT p.*, t.decimals, t.name as token_name, t.symbol as token_symbol, t.image_url as token_image_url
        FROM position p
        JOIN token t ON p.token_mint = t.mint
        WHERE p.account_id = $1
        ORDER BY p.created_at DESC;
      `;
      const dbResult = await client.query(positionQuery, [accountId]);
      const positions = dbResult.rows;

      if (positions.length === 0) {
        return [];
      }

      // 2. Collect all mints and fetch prices in USD from Jupiter V3
      const mints = positions.map(p => p.token_mint);
      mints.push(SOL_MINT); // Always get SOL price for conversions

      // Jupiter API V3 has a 50 token limit, so we need to batch requests
      const BATCH_SIZE = 49; // Leave room for SOL
      const priceData = {};

      // Fetch SOL price first
      const solPriceUrl = `https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`;
      const solResponse = await fetch(solPriceUrl);
      if (!solResponse.ok) {
        throw new Error(`Failed to fetch SOL price: ${solResponse.statusText}`);
      }
      const solPriceData = await solResponse.json();
      Object.assign(priceData, solPriceData);

      // Batch fetch token prices
      for (let i = 0; i < mints.length - 1; i += BATCH_SIZE) { // -1 to exclude SOL
        const batch = mints.slice(i, i + BATCH_SIZE);
        const batchUrl = `https://lite-api.jup.ag/price/v3?ids=${batch.join(',')}`;
        
        const batchResponse = await fetch(batchUrl);
        if (!batchResponse.ok) {
          fastify.log.warn(`Failed to fetch price batch ${i}-${i + BATCH_SIZE}: ${batchResponse.statusText}`);
          continue;
        }
        
        const batchData = await batchResponse.json();
        Object.assign(priceData, batchData);
      }

      const solPriceUsd = priceData[SOL_MINT]?.usdPrice || 0;

      // 3. Process each position (legacy logic)
      const portfolioResults = positions.map(p => {
        const currentTokenPriceUsd = priceData[p.token_mint]?.usdPrice || 0;
        const decimals = p.decimals || 0;
        const microtokenFactor = 10 ** decimals;
        const LAMPORTS_PER_SOL = 1e9;

        // --- Convert Base DB Values (from Lamports to SOL and USD) ---
        const totalBoughtSol = p.total_bought_lamports / LAMPORTS_PER_SOL;
        const totalSoldSol = p.total_sold_lamports / LAMPORTS_PER_SOL;
        const realizedPnlSolBase = parseFloat(p.realized_pnl_lamports || 0) / LAMPORTS_PER_SOL;

        const totalBoughtUsd = totalBoughtSol * solPriceUsd;
        const totalSoldUsd = totalSoldSol * solPriceUsd;
        const realizedPnlUsd = realizedPnlSolBase * solPriceUsd;
        
        const totalBoughtTokens = p.total_bought_microtokens / microtokenFactor;
        const totalSoldTokens = p.total_sold_microtokens / microtokenFactor;
        
        // --- Calculate Current Holdings and Unrealized PnL ---
        const currentHoldingsTokens = p.current_holdings_microtokens / microtokenFactor;
        const currentBalanceUsd = currentHoldingsTokens * currentTokenPriceUsd;
        const avgBuyPriceUsd = totalBoughtTokens > 0 ? totalBoughtUsd / totalBoughtTokens : 0;
        const avgBuyPriceSol = totalBoughtTokens > 0 ? totalBoughtSol / totalBoughtTokens : 0;
        const costBasisOfHoldingsUsd = currentHoldingsTokens * avgBuyPriceUsd;
        const unrealizedPnlUsd = currentBalanceUsd - costBasisOfHoldingsUsd;

        // --- Calculate Cost Basis of Tokens Sold ---
        const costBasisOfTokensSoldUsd = totalSoldTokens * avgBuyPriceUsd;

        // --- Calculate Final Totals ---
        const totalProfitUsd = unrealizedPnlUsd + realizedPnlUsd;
        const unrealizedPnlSol = solPriceUsd > 0 ? unrealizedPnlUsd / solPriceUsd : 0;
        const realizedPnlSol = realizedPnlSolBase;
        const totalProfitSol = unrealizedPnlSol + realizedPnlSol;

        // --- Format for UI Response ---
        return {
          token: {
            name: p.token_name,
            symbol: p.token_symbol,
            mint: p.token_mint,
            imageUrl: p.token_image_url,
          },
          balance: {
            tokens: currentHoldingsTokens,
            valueUsd: currentBalanceUsd,
            valueSol: solPriceUsd > 0 ? currentBalanceUsd / solPriceUsd : 0,
          },
          unrealizedPnl: {
            valueUsd: unrealizedPnlUsd,
            valueSol: unrealizedPnlSol,
            percentage: costBasisOfHoldingsUsd > 0 ? unrealizedPnlUsd / costBasisOfHoldingsUsd : 0,
          },
          realizedPnl: {
            valueUsd: realizedPnlUsd,
            valueSol: realizedPnlSol,
            percentage: costBasisOfTokensSoldUsd > 0 ? realizedPnlUsd / costBasisOfTokensSoldUsd : 0,
          },
          bought: {
            totalValueUsd: totalBoughtUsd,
            totalValueSol: totalBoughtSol,
            avgPriceUsd: avgBuyPriceUsd,
            avgPriceSol: avgBuyPriceSol,
          },
          sold: {
            totalValueUsd: totalSoldUsd,
            totalValueSol: totalSoldSol,
            avgPriceUsd: totalSoldTokens > 0 ? totalSoldUsd / totalSoldTokens : 0,
            avgPriceSol: totalSoldTokens > 0 ? totalSoldSol / totalSoldTokens : 0,
          },
          totalProfit: {
            valueUsd: totalProfitUsd,
            valueSol: totalProfitSol,
            percentage: totalBoughtUsd > 0 ? totalProfitUsd / totalBoughtUsd : 0,
          },
          transactionCounts: {
            buyCount: p.buy_tx_count || 0,
            sellCount: p.sell_tx_count || 0,
          },
        };
      });

      return portfolioResults;
    } catch (err) {
      fastify.log.error(err, 'Error fetching positions');
      return reply.code(500).send({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // GET a single position by token mint
  fastify.get('/:token_mint', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: accountId } = request.user;
    const { token_mint: tokenMint } = request.params;
    const client = await fastify.db.connect();

    try {
      // 1. Check if token exists
      const tokenResult = await client.query('SELECT * FROM token WHERE mint = $1', [tokenMint]);
      if (tokenResult.rows.length === 0) {
        return reply.code(204).send({});
      }
      const tokenData = tokenResult.rows[0];

      // 2. Get position data (or create an empty one)
      const positionQuery = `
        SELECT p.*, t.decimals, t.name as token_name, t.symbol as token_symbol, t.image_url as token_image_url
        FROM position p
        JOIN token t ON p.token_mint = t.mint
        WHERE p.account_id = $1 AND p.token_mint = $2;
      `;
      const positionResult = await client.query(positionQuery, [accountId, tokenMint]);
      let position = positionResult.rows[0];

      // If no position exists, create empty position data
      if (!position) {
        position = {
          token_name: tokenData.name,
          token_symbol: tokenData.symbol,
          token_image_url: tokenData.image_url,
          token_mint: tokenMint,
          decimals: tokenData.decimals || 0,
          current_holdings_microtokens: 0,
          total_bought_microtokens: 0,
          total_sold_microtokens: 0,
          total_bought_lamports: 0,
          total_sold_lamports: 0,
          realized_pnl_lamports: 0,
          created_at: null
        };
      }

      // 3. Get all orders for this position
      const ordersQuery = `
        SELECT 
          po.*,
          t.name as token_name,
          t.symbol as token_symbol,
          t.image_url as token_image_url,
          t.decimals
        FROM position_order po
        LEFT JOIN token t ON po.token_mint = t.mint
        WHERE po.account_id = $1 AND po.token_mint = $2
        ORDER BY po.created_at DESC
      `;
      const ordersResult = await client.query(ordersQuery, [accountId, tokenMint]);

      // 4. Fetch All Logs for the Position
      const logsQuery = `
        SELECT
          l.level,
          l.message,
          l.created_at AS timestamp,
          l.order_id
        FROM log l
        JOIN position_order po ON l.order_id = po.id
        WHERE po.account_id = $1 AND po.token_mint = $2
        ORDER BY l.created_at DESC
      `;
      const logsResult = await client.query(logsQuery, [accountId, tokenMint]);

      // 5. Get prices from Jupiter
      const mintsToFetch = [SOL_MINT, tokenMint];
      const priceUrl = `https://lite-api.jup.ag/price/v3?ids=${mintsToFetch.join(',')}`;
      const priceResponse = await fetch(priceUrl);
      if (!priceResponse.ok) {
        throw new Error(`Failed to fetch Jupiter prices: ${priceResponse.statusText}`);
      }
      const priceData = await priceResponse.json();

      const solPriceUsd = priceData[SOL_MINT]?.usdPrice || 0;
      const currentTokenPriceUsd = priceData[tokenMint]?.usdPrice || 0;

      // 6. Calculate position summary (legacy logic)
      const decimals = position.decimals || 0;
      const microtokenFactor = 10 ** decimals;
      const LAMPORTS_PER_SOL = 1e9;

      // Convert Base DB Values (from Lamports to SOL and USD)
      const totalBoughtSol = position.total_bought_lamports / LAMPORTS_PER_SOL;
      const totalSoldSol = position.total_sold_lamports / LAMPORTS_PER_SOL;
      const realizedPnlSol = parseFloat(position.realized_pnl_lamports || 0) / LAMPORTS_PER_SOL;

      const totalBoughtUsd = totalBoughtSol * solPriceUsd;
      const totalSoldUsd = totalSoldSol * solPriceUsd;
      const realizedPnlUsd = realizedPnlSol * solPriceUsd;
      
      const totalBoughtTokens = position.total_bought_microtokens / microtokenFactor;
      const totalSoldTokens = position.total_sold_microtokens / microtokenFactor;
      
      // Calculate Current Holdings and Unrealized PnL
      const currentHoldingsTokens = position.current_holdings_microtokens / microtokenFactor;
      const currentBalanceUsd = currentHoldingsTokens * currentTokenPriceUsd;
      const avgBuyPriceUsd = totalBoughtTokens > 0 ? totalBoughtUsd / totalBoughtTokens : 0;
      const avgBuyPriceSol = totalBoughtTokens > 0 ? totalBoughtSol / totalBoughtTokens : 0;
      const costBasisOfHoldingsUsd = currentHoldingsTokens * avgBuyPriceUsd;
      const unrealizedPnlUsd = currentBalanceUsd - costBasisOfHoldingsUsd;

      // Calculate Cost Basis of Tokens Sold
      const costBasisOfTokensSoldUsd = totalSoldTokens * avgBuyPriceUsd;

      // Calculate Final Totals
      const totalProfitUsd = unrealizedPnlUsd + realizedPnlUsd;
      const unrealizedPnlSol = solPriceUsd > 0 ? unrealizedPnlUsd / solPriceUsd : 0;
      const totalProfitSol = unrealizedPnlSol + realizedPnlSol;

      // 7. Transform orders based on type (legacy logic)
      const transformedOrders = ordersResult.rows.map(order => {
        const baseOrder = {
          id: order.id,
          token: {
            mint: order.token_mint,
            name: order.token_name,
            symbol: order.token_symbol,
            imageUrl: order.token_image_url,
          },
          status: order.status,
          createdAt: order.created_at,
          type: order.type,
        };

        if (order.type === 'Countersell') {
          const config = order.config || {};
          const orderDecimals = order.decimals || 0;
          const orderMicrotokenFactor = 10 ** orderDecimals;
          
          const tokensSold = Math.abs((order.token_amount_microtokens || 0) / orderMicrotokenFactor);
          const maxTokensToSell = (config.max_to_sell_microtokens || 0) / orderMicrotokenFactor;
          const targetMcapSol = (config.mcap_threshold_lamports || 0) / LAMPORTS_PER_SOL;
          const triggeringBuySol = (config.buy_threshold_lamports || 0) / LAMPORTS_PER_SOL;
          
          return {
            ...baseOrder,
            tokensSold: {
              amount: tokensSold,
              valueUsd: tokensSold * currentTokenPriceUsd,
              valueSol: solPriceUsd > 0 ? tokensSold * currentTokenPriceUsd / solPriceUsd : 0,
            },
            maxTokensToSell: maxTokensToSell,
            targetMcap: {
              valueSol: targetMcapSol,
              valueUsd: targetMcapSol * solPriceUsd,
            },
            triggeringBuy: {
              valueSol: triggeringBuySol,
              valueUsd: triggeringBuySol * solPriceUsd,
            },
            sellPercentage: config.sell_pct_bps || 0,
          };
        } else {
          // OneShot Buy/Sell
          const orderDecimals = order.decimals || 0;
          const orderMicrotokenFactor = 10 ** orderDecimals;
          
          const tokensAmount = (order.token_amount_microtokens || 0) / orderMicrotokenFactor;
          const solAmount = (order.sol_amount_lamports || 0) / LAMPORTS_PER_SOL;
          
          return {
            ...baseOrder,
            tokens: {
              amount: tokensAmount,
              valueUsd: tokensAmount * currentTokenPriceUsd,
              valueSol: solPriceUsd > 0 ? tokensAmount * currentTokenPriceUsd / solPriceUsd : 0,
            },
            sol: {
              amount: solAmount,
              valueUsd: solAmount * solPriceUsd,
            },
          };
        }
      });

      // 8. Build response (legacy structure)
      const response = {
        token: {
          name: position.token_name,
          symbol: position.token_symbol,
          mint: position.token_mint,
          imageUrl: position.token_image_url,
        },
        position: {
          balance: {
            tokens: currentHoldingsTokens,
            valueUsd: currentBalanceUsd,
            valueSol: solPriceUsd > 0 ? currentBalanceUsd / solPriceUsd : 0,
          },
          unrealizedPnl: {
            valueUsd: unrealizedPnlUsd,
            valueSol: unrealizedPnlSol,
            percentage: costBasisOfHoldingsUsd > 0 ? unrealizedPnlUsd / costBasisOfHoldingsUsd : 0,
          },
          realizedPnl: {
            valueUsd: realizedPnlUsd,
            valueSol: realizedPnlSol,
            percentage: costBasisOfTokensSoldUsd > 0 ? realizedPnlUsd / costBasisOfTokensSoldUsd : 0,
          },
          bought: {
            totalValueUsd: totalBoughtUsd,
            totalValueSol: totalBoughtSol,
            avgPriceUsd: avgBuyPriceUsd,
            avgPriceSol: avgBuyPriceSol,
          },
          sold: {
            totalValueUsd: totalSoldUsd,
            totalValueSol: totalSoldSol,
            avgPriceUsd: totalSoldTokens > 0 ? totalSoldUsd / totalSoldTokens : 0,
            avgPriceSol: totalSoldTokens > 0 ? totalSoldSol / totalSoldTokens : 0,
          },
          totalProfit: {
            valueUsd: totalProfitUsd,
            valueSol: totalProfitSol,
            percentage: totalBoughtUsd > 0 ? totalProfitUsd / totalBoughtUsd : 0,
          },
          transactionCounts: {
            buyCount: position.buy_tx_count || 0,
            sellCount: position.sell_tx_count || 0,
          },
        },
        orders: transformedOrders,
        logs: logsResult.rows,
      };

      return response;
    } catch (err) {
      fastify.log.error(err, 'Error fetching position by mint');
      return reply.code(500).send({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // GET logs for a specific position
  fastify.get('/:tokenMint/logs', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: accountId } = request.user;
    const { tokenMint } = request.params;
    const client = await fastify.db.connect();

    try {
      // Fetch logs for the position
      const logsQuery = `
        SELECT
          l.level,
          l.message,
          l.created_at AS timestamp,
          l.order_id
        FROM log l
        JOIN position_order po ON l.order_id = po.id
        WHERE po.account_id = $1 AND po.token_mint = $2
        ORDER BY l.created_at DESC
      `;
      const logsResult = await client.query(logsQuery, [accountId, tokenMint]);

      return logsResult.rows;
    } catch (err) {
      fastify.log.error(err, 'Error fetching position logs');
      return reply.code(500).send({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  });
}

export default positionsRoutes;
