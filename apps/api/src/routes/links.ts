import { FastifyInstance } from 'fastify';
import { createLinkSchema, updateLinkSchema } from '@sniprl/shared';
import {
  createLinkService,
  getLinkStatsService,
  updateLinkService,
} from '../services/linkService.js';
import { extractBearerToken } from '../utils/security.js';

export async function linkRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/links', async (request, reply) => {
    // 1. Zod schema validation
    const parsedBody = createLinkSchema.parse(request.body);

    // 2. Execute link creation service
    const result = await createLinkService(parsedBody);

    return reply.status(201).send(result);
  });

  fastify.get<{ Params: { shortCode: string } }>(
    '/api/links/:shortCode/stats',
    async (request, reply) => {
      const { shortCode } = request.params;

      // Token-authenticated via Authorization: Bearer <managementToken>.
      // Header value is redacted by the Pino config; never logged here.
      const providedToken = extractBearerToken(request.headers.authorization);

      const stats = await getLinkStatsService(shortCode, providedToken);

      return reply.status(200).send(stats);
    },
  );

  fastify.patch<{ Params: { shortCode: string } }>(
    '/api/links/:shortCode',
    async (request, reply) => {
      const { shortCode } = request.params;

      // Same validation rules as creation: updateLinkSchema mirrors
      // createLinkSchema (identical messages/checks, nullable only to clear).
      const parsedBody = updateLinkSchema.parse(request.body);

      const providedToken = extractBearerToken(request.headers.authorization);

      const updated = await updateLinkService(shortCode, providedToken, parsedBody);

      return reply.status(200).send(updated);
    },
  );
}
