import { FastifyInstance } from 'fastify';
import { resolveRedirectService } from '../services/linkService.js';

export async function redirectRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { shortCode: string } }>('/:shortCode', async (request, reply) => {
    const { shortCode } = request.params;

    // Step 13 cache-aside: request-scoped logger carries the request-id into
    // hit/miss debug logs (only the cache key is ever logged, never values).
    const { longUrl } = await resolveRedirectService(shortCode, request.log);

    // Set Cache-Control: no-store to ensure clicks always hit the server (essential for analytics in Step 15)
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');

    // Perform 302 Temporary Redirect
    return reply.redirect(longUrl, 302);
  });
}
