import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { getToken } from '../../lib/token.js';
import { getWalletForOrder, buildOrderContext } from '../../lib/order.js';

async function orderRoutes (fastify, options) {
  // CREATE Order
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: accountId } = request.user;
    fastify.log.info({ accountId }, 'createOrder invoked');

    const { body } = request;
    if (!body.token_mint || !body.type) {
      return reply.code(400).send({ message: 'token_mint and type are required' });
    }

    const { type, token_mint: tokenMint } = body;
    const client = await fastify.db.connect();
    let newOrderId;

    try {
      await client.query('BEGIN');

      const tokenData = await getToken(fastify, client, tokenMint);
      const walletInfo = await getWalletForOrder(fastify, client, accountId);

      const { dbRecord, sqsMessage } = await buildOrderContext(fastify, type, body, tokenData, accountId);

      const orderResult = await client.query(dbRecord);
      newOrderId = orderResult.rows[0].id;
      await client.query('COMMIT');
      fastify.log.info({ orderId: newOrderId, type }, 'order created in db');

      const messageBody = {
        command_type: 'CREATE_ORDER',
        order_id: newOrderId,
        account_id: accountId,
        ...sqsMessage,
        wallet_public_key: walletInfo.public_key,
        wallet_private_key_encrypted: walletInfo.private_key_encrypted
      };

      const command = new SendMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        MessageBody: JSON.stringify(messageBody)
      });

      await fastify.sqs.send(command);
      fastify.log.info({ orderId: newOrderId }, 'sqs message sent');

      return reply.code(201).send({ id: newOrderId });
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error(err, 'order creation error');
      if (err.statusCode) {
        return reply.code(err.statusCode).send({ message: err.message });
      }
      return reply.code(500).send({ message: 'internal server error' });
    } finally {
      client.release();
    }
  });

  // LIST Orders
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: accountId } = request.user;
    const { token_mint: tokenMint } = request.query;
    const client = await fastify.db.connect();

    try {
      // 1. Get orders with token metadata
      const params = [accountId];
      let query = `
        SELECT
          po.*,
          t.name as token_name,
          t.symbol as token_symbol,
          t.image_url as token_image_url,
          t.decimals
        FROM position_order po
        LEFT JOIN token t ON po.token_mint = t.mint
        WHERE po.account_id = $1
      `;

      if (tokenMint) {
        query += ' AND po.token_mint = $2';
        params.push(tokenMint);
      }

      query += ' ORDER BY po.created_at DESC';

      const result = await client.query(query, params);
      const orders = result.rows;

      if (orders.length === 0) {
        return [];
      }

      // 2. Get SOL price for USD conversions
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const priceUrl = `https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`;
      const priceResponse = await fetch(priceUrl);

      if (!priceResponse.ok) {
        fastify.log.error('Failed to fetch SOL price');
        throw new Error('Failed to fetch price data');
      }

      const priceData = await priceResponse.json();
      const solPriceUsd = priceData[SOL_MINT]?.usdPrice || 0;

      // 3. Transform orders based on type
      const transformedOrders = orders.map(order => {
        const baseOrder = {
          id: order.id,
          token: {
            mint: order.token_mint,
            name: order.token_name,
            symbol: order.token_symbol,
            imageUrl: order.token_image_url
          },
          status: order.status,
          createdAt: order.created_at,
          type: order.type
        };

        const LAMPORTS_PER_SOL = 1e9;

        if (order.type === 'Countersell') {
          const config = order.config || {};
          const decimals = order.decimals || 0;
          const microtokenFactor = 10 ** decimals;

          const tokensSold = (order.token_amount_microtokens || 0) / microtokenFactor;
          const maxTokensToSell = (config.max_to_sell_microtokens || 0) / microtokenFactor;
          const targetMcapSol = (config.mcap_threshold_lamports || 0) / LAMPORTS_PER_SOL;
          const triggeringBuySol = (config.buy_threshold_lamports || 0) / LAMPORTS_PER_SOL;

          return {
            ...baseOrder,
            tokensSold: {
              amount: tokensSold,
              valueUsd: tokensSold * (order.current_price_usd || 0),
              valueSol: tokensSold * (order.current_price_sol || 0)
            },
            maxTokensToSell,
            targetMcap: {
              valueSol: targetMcapSol,
              valueUsd: targetMcapSol * solPriceUsd
            },
            triggeringBuy: {
              valueSol: triggeringBuySol,
              valueUsd: triggeringBuySol * solPriceUsd
            },
            sellPercentage: config.sell_pct_bps || 0
          };
        } else { // OneShot Buy/Sell
          const decimals = order.decimals || 0;
          const microtokenFactor = 10 ** decimals;

          const tokensAmount = (order.token_amount_microtokens || 0) / microtokenFactor;
          const solAmount = (order.sol_amount_lamports || 0) / LAMPORTS_PER_SOL;

          return {
            ...baseOrder,
            tokens: {
              amount: tokensAmount,
              valueUsd: tokensAmount * (order.current_price_usd || 0),
              valueSol: tokensAmount * (order.current_price_sol || 0)
            },
            sol: {
              amount: solAmount,
              valueUsd: solAmount * solPriceUsd
            }
          };
        }
      });

      return transformedOrders;
    } catch (err) {
      fastify.log.error(err, 'Error fetching orders');
      return reply.code(500).send({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // GET Order by ID
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: accountId } = request.user;
    const { id } = request.params;
    const client = await fastify.db.connect();

    try {
      const query = `
        SELECT
          po.*,
          t.name as token_name,
          t.symbol as token_symbol,
          t.image_url as token_image_url,
          t.decimals
        FROM position_order po
        LEFT JOIN token t ON po.token_mint = t.mint
        WHERE po.account_id = $1 AND po.id = $2
      `;

      const result = await client.query(query, [accountId, id]);

      if (result.rows.length === 0) {
        return reply.code(404).send({ message: 'Order not found' });
      }

      const order = result.rows[0];

      // 2. Get SOL and token price for USD conversions
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const mintsToFetch = [SOL_MINT, order.token_mint];
      const priceUrl = `https://lite-api.jup.ag/price/v3?ids=${mintsToFetch.join(',')}`;
      const priceResponse = await fetch(priceUrl);

      if (!priceResponse.ok) {
        fastify.log.error({ status: priceResponse.status }, 'Failed to fetch prices');
        throw new Error('Failed to fetch price data');
      }

      const priceData = await priceResponse.json();
      const solPriceUsd = priceData[SOL_MINT]?.usdPrice || 0;
      const currentTokenPriceUsd = priceData[order.token_mint]?.usdPrice || 0;

      // 3. Transform order based on type
      const baseOrder = {
        id: order.id,
        token: {
          mint: order.token_mint,
          name: order.token_name,
          symbol: order.token_symbol,
          imageUrl: order.token_image_url
        },
        status: order.status,
        createdAt: order.created_at,
        type: order.type
      };

      const LAMPORTS_PER_SOL = 1e9;
      let transformedOrder;

      if (order.type === 'Countersell') {
        const config = order.config || {};
        const decimals = order.decimals || 0;
        const microtokenFactor = 10 ** decimals;

        const tokensSold = (order.token_amount_microtokens || 0) / microtokenFactor;
        const maxTokensToSell = (config.max_to_sell_microtokens || 0) / microtokenFactor;
        const targetMcapSol = (config.mcap_threshold_lamports || 0) / LAMPORTS_PER_SOL;
        const triggeringBuySol = (config.buy_threshold_lamports || 0) / LAMPORTS_PER_SOL;

        transformedOrder = {
          ...baseOrder,
          tokensSold: {
            amount: tokensSold,
            valueUsd: tokensSold * currentTokenPriceUsd,
            valueSol: solPriceUsd > 0 ? (tokensSold * currentTokenPriceUsd) / solPriceUsd : 0
          },
          maxTokensToSell,
          targetMcap: {
            valueSol: targetMcapSol,
            valueUsd: targetMcapSol * solPriceUsd
          },
          triggeringBuy: {
            valueSol: triggeringBuySol,
            valueUsd: triggeringBuySol * solPriceUsd
          },
          sellPercentage: (config.sell_pct_bps || 0) / 100
        };
      } else { // OneShot Buy/Sell
        const decimals = order.decimals || 0;
        const microtokenFactor = 10 ** decimals;

        const tokensAmount = (order.token_amount_microtokens || 0) / microtokenFactor;
        const solAmount = (order.sol_amount_lamports || 0) / LAMPORTS_PER_SOL;

        transformedOrder = {
          ...baseOrder,
          tokens: {
            amount: tokensAmount,
            valueUsd: tokensAmount * currentTokenPriceUsd,
            valueSol: solPriceUsd > 0 ? (tokensAmount * currentTokenPriceUsd) / solPriceUsd : 0
          },
          sol: {
            amount: solAmount,
            valueUsd: solAmount * solPriceUsd
          }
        };
      }
      return transformedOrder;
    } catch (err) {
      fastify.log.error(err, 'Error fetching order by ID');
      return reply.code(500).send({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // STATUS endpoint
  fastify.get('/:id/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: accountId } = request.user;
    const { id: orderId } = request.params;
    const client = await fastify.db.connect();

    try {
      const query = `
        SELECT 
          po.id,
          po.type,
          po.status, 
          po.sol_amount_lamports,
          po.token_amount_microtokens,
          po.config,
          po.created_at, 
          po.updated_at,
          t.decimals
        FROM position_order po
        LEFT JOIN token t ON po.token_mint = t.mint
        WHERE po.id = $1 AND po.account_id = $2
      `;
      const { rows } = await client.query(query, [orderId, accountId]);

      if (rows.length === 0) {
        return reply.code(404).send({ message: 'Order not found' });
      }
      
      const order = rows[0];

      // default to 6 decimals if for some reason the token join fails
      const decimals = order.decimals || 6;

      const solAmount = order.sol_amount_lamports / 1_000_000_000;
      const tokenAmount = order.token_amount_microtokens / (10 ** decimals);

      // construct and return the user-friendly response
      return {
        id: order.id,
        type: order.type,
        status: order.status,
        sol_amount: solAmount,
        token_amount: tokenAmount,
        updated_at: order.updated_at
      };
    } catch (err) {
      fastify.log.error(err, 'Error fetching order status');
      return reply.code(500).send({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // DELETE Order
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: accountId } = request.user;
    const { id } = request.params;
    const client = await fastify.db.connect();

    try {
      const result = await client.query(
        `SELECT
           po.token_mint,
           po.type,
           a.public_key
         FROM position_order po
         JOIN account a ON po.account_id = a.id
         WHERE po.id = $1 AND po.account_id = $2`,
        [id, accountId]
      );

      if (result.rowCount === 0) {
        return reply.code(404).send({ message: 'Order not found' });
      }

      const { token_mint: tokenMint, type, public_key: publicKey } = result.rows[0];

      const messageBody = {
        command_type: 'DELETE_ORDER',
        order_id: id,
        account_id: accountId,
        wallet_public_key: publicKey,
        token_mint: tokenMint,
        order_type: type
      };

      const command = new SendMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        MessageBody: JSON.stringify(messageBody)
      });

      await fastify.sqs.send(command);
      fastify.log.info({ orderId: id }, 'sqs delete message sent');

      return reply.code(204).send();
    } catch (err) {
      fastify.log.error(err, 'Error deleting order');
      return reply.code(500).send({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  });
}

export default orderRoutes;
