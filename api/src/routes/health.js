async function healthRoutes (fastify, options) {
  fastify.get('/health', async (request, reply) => {
    return { status: 'enjoy the trenches :D' };
  });
}

export default healthRoutes;
