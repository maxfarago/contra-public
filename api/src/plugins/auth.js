import fp from 'fastify-plugin';
import { verifyToken } from '../lib/auth.js';

async function authPlugin (fastify, options) {
  fastify.decorate('authenticate', async function (request, reply) {
    try {
      const token = request.cookies.authToken;
      if (!token) {
        throw new Error('Missing auth token cookie');
      }

      const decoded = verifyToken(token);
      request.user = decoded; // Attach user payload to the request
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized', message: err.message });
    }
  });
}

export default fp(authPlugin);
