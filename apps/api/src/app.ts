import Fastify, { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { loadEnv } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRoutes } from './routes/health.js';
import { linkRoutes } from './routes/links.js';

export function buildApp(): FastifyInstance {
  const env = loadEnv();

  const isDev = env.NODE_ENV === 'development';

  const app = Fastify({
    requestIdHeader: 'x-request-id',
    genReqId: (req) => {
      const headerReqId = req.headers['x-request-id'];
      if (typeof headerReqId === 'string' && headerReqId.trim().length > 0) {
        return headerReqId;
      }
      return randomUUID();
    },
    logger: {
      level: isDev ? 'debug' : 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'authorization',
          'managementToken',
          'management_token',
          'apiKey',
          'api_key',
          'cookie',
          'cookies',
          'password',
          'passwordHash',
        ],
        censor: '[REDACTED]',
      },
      transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
  });

  // 1. Hook: propagate request id on response headers
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // 2. Register global error handler
  app.setErrorHandler(errorHandler);

  // 3. Register structured 404 handler for unknown routes
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  // 4. Register route modules
  app.register(healthRoutes);
  app.register(linkRoutes);

  return app;
}
