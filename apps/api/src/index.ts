import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { closeRedis, getRedisClient } from './cache/redis.js';
import { prisma } from './db/prisma.js';

const env = loadEnv();
const app = buildApp();

async function start(): Promise<void> {
  try {
    // Fail fast on invalid REDIS_URL. A down Redis server does NOT throw
    // here — connection is async and the app degrades to the database.
    getRedisClient();
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`SnipRL API server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  } catch (err) {
    app.log.error(err, 'Failed to start API server');
    process.exit(1);
  }
}

// Graceful Shutdown handling for SIGTERM & SIGINT
async function gracefulShutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'Graceful shutdown signal received. Draining connections...');

  try {
    // 1. Stop taking new requests and close HTTP server
    await app.close();
    app.log.info('HTTP server closed');

    // 2. Disconnect Prisma DB client
    await prisma.$disconnect();
    app.log.info('Database client disconnected');

    // 3. Close Redis singleton (stops reconnection attempts)
    await closeRedis();

    process.exit(0);
  } catch (err) {
    app.log.error(err, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

start();
