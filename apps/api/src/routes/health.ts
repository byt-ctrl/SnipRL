import { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (_request, reply) => {
    try {
      // Execute DB ping SELECT 1
      await prisma.$queryRaw`SELECT 1`;

      return reply.status(200).send({
        ok: true,
        db: 'up',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      fastify.log.error({ err }, 'Health check database ping failed');

      return reply.status(503).send({
        ok: false,
        db: 'down',
        error: 'Database connection failed',
        timestamp: new Date().toISOString(),
      });
    }
  });
}
