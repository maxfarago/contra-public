import { generateAndSaveWallet } from '../../lib/wallet.js';
import { generateToken } from '../../lib/auth.js';

async function walletRoutes (fastify, options) {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    ...(process.env.NODE_ENV === 'production' ? { domain: '.contra.trade' } : {})
  };
  
  // CREATE new wallet (does not graduate session)
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: accountId, firstLogin } = request.user;
    if (!firstLogin) {
      return reply.code(403).send({ message: 'Forbidden: Wallet has already been created.' });
    }

    const client = await fastify.db.connect();
    try {
      const { rows } = await client.query(
        'SELECT public_key FROM account WHERE id = $1 AND public_key IS NOT NULL',
        [accountId]
      );

      if (rows.length > 0) {
        return reply.code(409).send({ message: 'Wallet already exists. Use the reset endpoint if you need a new one.' });
      }

      const walletData = await generateAndSaveWallet(fastify, client, accountId);
      // NOTE: We do NOT set a new cookie here. The user is still in the onboarding flow.
      return reply.code(201).send(walletData);
    } catch (err) {
      fastify.log.error(err, 'wallet creation error');
      return reply.code(500).send({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // RESET wallet (for users who lose keys before confirming)
  fastify.post('/reset', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: accountId, firstLogin } = request.user;
    if (!firstLogin) {
      return reply.code(403).send({ message: 'Forbidden: This action requires a first-login token.' });
    }

    const client = await fastify.db.connect();
    try {
      // no need to null out keys, generateAndSaveWallet will just overwrite them
      const walletData = await generateAndSaveWallet(fastify, client, accountId);
      fastify.log.info({ accountId }, 'wallet has been reset');
      return reply.code(201).send(walletData);
    } catch (err) {
      fastify.log.error(err, 'wallet reset error');
      return reply.code(500).send({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  });
  
  // CONFIRM wallet creation and graduate session
  fastify.post('/confirm', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: accountId, user: username, tid: telegramId, firstLogin } = request.user;

    if (!firstLogin) {
      return reply.code(403).send({ message: 'Forbidden: Onboarding already complete.' });
    }
    
    // generate the upgraded token
    const upgradedToken = generateToken({
      id: accountId,
      tid: telegramId,
      user: username,
      firstLogin: false // "graduate" the user
    });
    
    // set the new token in the httpOnly cookie
    reply.setCookie('authToken', upgradedToken, cookieOptions);

    fastify.log.info({ accountId }, 'wallet confirmation successful, session upgraded');
    return reply.code(200).send({ message: 'Onboarding complete.' });
  });

  // GET wallet info
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: accountId } = request.user;
    fastify.log.info({ accountId }, 'fetching wallet info');
    const client = await fastify.db.connect();

    try {
      const { rows } = await client.query(
        'SELECT public_key FROM account WHERE id = $1',
        [accountId]
      );

      if (rows.length === 0 || !rows[0].public_key) {
        fastify.log.warn({ accountId }, 'account or public key not found for GET /wallet');
        return reply.code(404).send({ message: 'wallet not found' });
      }

      const publicKey = rows[0].public_key;
      const url = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'axton-api',
          method: 'searchAssets',
          params: {
            ownerAddress: publicKey,
            tokenType: 'all'
          }
        })
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(`Helius API error: ${JSON.stringify(data.error)}`);
      }

      const items = data.result?.items || [];
      const holdings = items
        .filter((item) => !item.interface?.includes('NFT'))
        .map((item) => {
          const decimals = item.token_info?.decimals || 0;
          const rawBalance = item.token_info?.balance;

          return {
            address: item.id,
            name: item.content?.metadata?.name,
            symbol: item.content?.metadata?.symbol,
            image: item.content?.links?.image,
            balance: rawBalance / 10 ** decimals,
            rawBalance: rawBalance,
          };
        })
        .sort((a, b) => (b.balance || 0) - (a.balance || 0));

      const totalTokenAccounts = holdings.length;
      const totalTokensHeld = holdings.reduce(
        (sum, token) => sum + (token.balance || 0),
        0
      );

      return {
        publicKey,
        totalTokenAccounts,
        totalTokensHeld,
        holdings
      };
    } catch (err) {
      fastify.log.error(err, 'error fetching wallet');
      return reply.code(500).send({ message: 'error fetching wallet info' });
    } finally {
      client.release();
    }
  });

  // GET SOL balance
  fastify.get('/sol', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: accountId } = request.user;
    fastify.log.info({ accountId }, 'fetching SOL balance');
    const client = await fastify.db.connect();

    try {
      const { rows } = await client.query(
        'SELECT public_key FROM account WHERE id = $1',
        [accountId]
      );

      if (rows.length === 0 || !rows[0].public_key) {
        fastify.log.warn({ accountId }, 'account or public key not found for GET /wallet/sol');
        return reply.code(404).send({ message: 'wallet not found' });
      }

      const publicKey = rows[0].public_key;
      const url = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'axton-api',
          method: 'getBalance',
          params: [publicKey]
        })
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(`Helius API error: ${JSON.stringify(data.error)}`);
      }

      // SOL balance is returned in lamports (1 SOL = 1,000,000,000 lamports)
      const balanceInLamports = data.result?.value || 0;
      const balanceInSol = balanceInLamports / 1_000_000_000;

      fastify.log.info({ accountId, publicKey, balanceInSol }, 'successfully fetched SOL balance');
      return {
        publicKey,
        balance: balanceInSol,
        balanceInLamports
      };
    } catch (err) {
      fastify.log.error(err, 'error fetching SOL balance');
      return reply.code(500).send({ message: 'error fetching SOL balance' });
    } finally {
      client.release();
    }
  });

  // GET holdings for atlas trading (tokens created in the last 3 hours)
  fastify.get('/atlas', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: accountId } = request.user;
    const client = await fastify.db.connect();

    try {
      const query = `
        SELECT
          po.token_mint AS mint,
          otx.result_amount_microtokens,
          otx.result_amount_lamports,
          tok.decimals
        FROM order_tx AS otx
        JOIN position_order AS po ON otx.order_id = po.id
        JOIN token AS tok ON po.token_mint = tok.mint
        WHERE
          po.account_id = $1 AND
          tok.added_at >= NOW() - INTERVAL '3 hours' AND
          otx.status = 'CONFIRMED'
        ORDER BY otx.confirmed_at ASC;
      `;
      const { rows: transactions } = await client.query(query, [accountId]);

      const holdings = transactions.reduce((acc, tx) => {
        const { mint, result_amount_microtokens, result_amount_lamports, decimals } = tx;

        if (!acc[mint]) {
          acc[mint] = {
            total_tokens_bought: 0,
            total_tokens_sold: 0,
            total_sol_spent: 0,
          };
        }

        const microtokens = Number(result_amount_microtokens);
        const lamports = Number(result_amount_lamports);

        // buys are positive microtokens
        if (microtokens > 0) {
          acc[mint].total_tokens_bought += microtokens / (10 ** decimals);
          acc[mint].total_sol_spent += Math.abs(lamports) / 1_000_000_000;
        } 
        // sells are negative microtokens
        else if (microtokens < 0) {
          acc[mint].total_tokens_sold += Math.abs(microtokens) / (10 ** decimals);
        }

        return acc;
      }, {});

      const atlasHoldings = Object.entries(holdings)
        .map(([mint, data]) => {
          const quantity = data.total_tokens_bought - data.total_tokens_sold;

          const avg_buy_price_sol = data.total_tokens_bought > 0 
            ? data.total_sol_spent / data.total_tokens_bought 
            : 0;

          return {
            mint,
            quantity,
            cost_basis_sol: avg_buy_price_sol * quantity,
          };
        });

      return atlasHoldings;
    } catch (err) {
      fastify.log.error(err, 'error fetching atlas holdings');
      return reply.code(500).send({ message: 'error fetching atlas holdings' });
    } finally {
      client.release();
    }
  });
}

export default walletRoutes;
