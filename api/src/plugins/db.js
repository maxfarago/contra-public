import fp from 'fastify-plugin';
import pg from 'pg';
// import { Signer } from '@aws-sdk/rds-signer'; // No longer needed

const { Pool } = pg;

async function dbConnector (fastify, options) {
  const poolConfig = {
    connectionString: process.env.DB_CXN_STRING
  };

  // enable ssl for non-local environments
  if (process.env.NODE_ENV !== 'local') {
    poolConfig.ssl = {
      rejectUnauthorized: false
    };
  }

  // log database connection info
  if (process.env.DB_CXN_STRING) {
    try {
      const url = new URL(process.env.DB_CXN_STRING);
      fastify.log.debug({
        host: url.hostname,
        port: url.port || 5432,
        database: url.pathname.slice(1),
        ssl: process.env.NODE_ENV !== 'local'
      }, 'database connection configured');
    } catch (err) {
      fastify.log.warn({ error: err.message }, 'could not parse db connection string');
    }
  } else {
    fastify.log.warn('DB_CXN_STRING not set');
  }

  const pool = new Pool(poolConfig);
  fastify.decorate('db', pool);

  fastify.addHook('onClose', async (instance) => {
    await instance.db.end();
  });
}

export default fp(dbConnector);
