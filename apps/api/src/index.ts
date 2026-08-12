import Fastify from 'fastify';
import { loadEnv } from './config/env.js';
import { setErrorHandler } from './middleware/errorHandler.js';
import { healthRoutes } from './routes/health.js';
import { encodeBase62, SHORT_CODE_LENGTH } from '@sniprl/shared';

const env = loadEnv();

const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

fastify.setErrorHandler(setErrorHandler);
fastify.register(healthRoutes);

fastify.get('/api/demo-base62', async () => {
  const sampleId = 123456789n;
  const encoded = encodeBase62(sampleId);
  return {
    sampleId: sampleId.toString(),
    encoded,
    length: SHORT_CODE_LENGTH,
  };
});

const start = async () => {
  try {
    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`SnipRL API running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
