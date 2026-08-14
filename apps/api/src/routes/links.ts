import { FastifyInstance } from 'fastify';
import { createLinkSchema } from '@sniprl/shared';
import { createLinkService } from '../services/linkService.js';

export async function linkRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/links', async (request, reply) => {
    // 1. Zod schema validation
    const parsedBody = createLinkSchema.parse(request.body);

    // 2. Execute link creation service
    const result = await createLinkService(parsedBody);

    return reply.status(201).send(result);
  });
}
