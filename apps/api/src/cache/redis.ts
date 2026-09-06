/**
 * Step 12 — Redis client layer (singleton).
 *
 * A single shared `ioredis` client configured from `REDIS_URL`, with:
 * - Fail-fast validation of `REDIS_URL` at boot (invalid config throws
 *   immediately instead of failing obscurely on first use).
 * - Exponential-backoff `retryStrategy` with jitter; every reconnection
 *   attempt and lifecycle event (`connect`, `ready`, `error`, `close`,
 *   `reconnecting`, `end`) is logged. Reconnects never stop on their own —
 *   while Redis is down the app keeps serving from the database.
 * - Safe helper wrappers (`get`/`set`/`del`/`incr`/`hset`/`hget` with JSON
 *   serialization) that never throw: on outage or corrupt values they log
 *   and return a fallback so a Redis failure can never crash the app
 *   (degradation contract, verified in Step 12).
 *
 * Privacy: keys may be logged (they contain short codes only); values are
 * never logged because they can embed destination URLs. Credentials in
 * `REDIS_URL` are redacted in every log line.
 */

import { Redis } from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { loadEnv } from '../config/env.js';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/** Minimal logger surface — compatible with the Fastify/Pino app logger. */
export interface RedisLogger {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

function consoleLoggerMethod(level: 'debug' | 'info' | 'warn' | 'error') {
  return (obj: unknown, msg?: string): void => {
    console[level](`[redis] ${msg ?? ''}`, obj);
  };
}

let activeLogger: RedisLogger = {
  debug: consoleLoggerMethod('debug'),
  info: consoleLoggerMethod('info'),
  warn: consoleLoggerMethod('warn'),
  error: consoleLoggerMethod('error'),
};

/**
 * Route Redis lifecycle/helper logs through a custom logger
 * (e.g. the Fastify Pino instance via `setRedisLogger(app.log)`).
 */
export function setRedisLogger(logger: RedisLogger): void {
  activeLogger = logger;
}

// ---------------------------------------------------------------------------
// Retry / backoff tuning
// ---------------------------------------------------------------------------

/** Base delay (ms) for attempt #1; doubles every attempt. */
export const REDIS_RETRY_BASE_DELAY_MS = 50;
/** Upper bound (ms) for the backoff delay, before jitter. */
export const REDIS_RETRY_MAX_DELAY_MS = 2000;
/** Random jitter (ms) added to each delay to avoid thundering-herd reconnects. */
export const REDIS_RETRY_JITTER_MS = 200;
/**
 * Pending commands fail after this many retries so helpers can degrade to
 * the database instead of hanging the request path during an outage.
 */
export const REDIS_MAX_RETRIES_PER_REQUEST = 3;

/**
 * Exponential backoff with jitter: `min(2^(attempt-1) * 50, 2000) + rand(0..199)`.
 * Pure function, exported for unit testing. Attempt numbers start at 1.
 */
export function computeRetryDelay(attempt: number): number {
  const normalized = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  const exponential = Math.pow(2, normalized - 1) * REDIS_RETRY_BASE_DELAY_MS;
  const capped = Math.min(exponential, REDIS_RETRY_MAX_DELAY_MS);
  return capped + Math.floor(Math.random() * REDIS_RETRY_JITTER_MS);
}

// ---------------------------------------------------------------------------
// REDIS_URL handling (fail-fast + redaction)
// ---------------------------------------------------------------------------

/**
 * Validate `REDIS_URL` shape. Returns the trimmed URL, or throws a
 * descriptive error (without credentials) so bad config fails at boot.
 */
export function validateRedisUrl(url: unknown): string {
  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new Error('Invalid Redis configuration: REDIS_URL must be a non-empty string');
  }
  const trimmed = url.trim();
  let protocol: string;
  try {
    protocol = new URL(trimmed).protocol;
  } catch {
    throw new Error('Invalid Redis configuration: REDIS_URL is not a parseable URL');
  }
  if (protocol !== 'redis:' && protocol !== 'rediss:') {
    throw new Error(
      `Invalid Redis configuration: REDIS_URL must use redis:// or rediss:// (got "${protocol}//")`,
    );
  }
  return trimmed;
}

/** Redact credentials from a Redis URL for safe logging. */
export function sanitizeRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // NOTE: the redaction token must stay URL-safe (no brackets — the
    // WHATWG serializer would percent-encode them).
    if (parsed.password) {
      parsed.password = 'REDACTED';
    } else if (parsed.username) {
      parsed.username = 'REDACTED';
    }
    return parsed.toString();
  } catch {
    return '[invalid-redis-url]';
  }
}

/**
 * Map a validated `redis://` / `rediss://` URL to explicit `RedisOptions`.
 * Throws on out-of-range ports or database indexes (fail-fast at boot).
 */
export function redisOptionsFromUrl(redisUrl: string): RedisOptions {
  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw new Error('Invalid Redis configuration: REDIS_URL is not a parseable URL');
  }

  const port = parsed.port === '' ? 6379 : Number(parsed.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid Redis configuration: port "${parsed.port}" out of range 1-65535`);
  }

  const pathSegment = parsed.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  const db = pathSegment === '' ? 0 : Number(pathSegment);
  if (!Number.isInteger(db) || db < 0) {
    throw new Error(
      `Invalid Redis configuration: database "${parsed.pathname}" must be a number >= 0`,
    );
  }

  const options: RedisOptions = {
    host: parsed.hostname === '' ? '127.0.0.1' : parsed.hostname,
    port,
    db,
  };
  if (parsed.username !== '') {
    options.username = decodeURIComponent(parsed.username);
  }
  if (parsed.password !== '') {
    options.password = decodeURIComponent(parsed.password);
  }
  if (parsed.protocol === 'rediss:') {
    options.tls = {};
  }
  return options;
}

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

declare global {
  var __sniprlRedis: Redis | undefined;
}

/** Last reported reconnect attempt number (for `reconnecting` event logs). */
let reconnectAttempt = 0;

function buildResilienceOptions(): RedisOptions {
  return {
    // Connect in the background; client creation never blocks app boot.
    lazyConnect: false,
    enableReadyCheck: true,
    // Fail commands fast while disconnected so helpers degrade to the
    // database instead of queueing unboundedly during an outage.
    enableOfflineQueue: false,
    maxRetriesPerRequest: REDIS_MAX_RETRIES_PER_REQUEST,
    retryStrategy: (times: number): number => {
      reconnectAttempt = times;
      const delay = computeRetryDelay(times);
      activeLogger.warn(
        { attempt: times, delayMs: delay },
        'Redis connection lost — scheduling reconnect attempt',
      );
      // Always return a delay: keep retrying forever; the app degrades
      // to the database in the meantime (degradation contract).
      return delay;
    },
    reconnectOnError: (err: Error): boolean => {
      // ElastiCache-style primary failover surfaces as READONLY on writes;
      // reconnect so we land on the new primary.
      if (err.message.includes('READONLY')) {
        activeLogger.warn(
          { err: err.message },
          'Redis READONLY error — reconnecting (possible primary failover)',
        );
        return true;
      }
      return false;
    },
  };
}

function attachLifecycleListeners(client: Redis, redactedUrl: string): void {
  client.on('connect', () => {
    reconnectAttempt = 0;
    activeLogger.info({ redisUrl: redactedUrl }, 'Redis connected');
  });
  client.on('ready', () => {
    reconnectAttempt = 0;
    activeLogger.info({}, 'Redis ready to accept commands');
  });
  client.on('error', (err: Error) => {
    activeLogger.error({ err: err.message }, 'Redis error');
  });
  client.on('close', () => {
    activeLogger.warn({}, 'Redis connection closed');
  });
  client.on('reconnecting', (delayMs: number) => {
    activeLogger.warn({ attempt: reconnectAttempt, delayMs }, 'Redis reconnecting');
  });
  client.on('end', () => {
    activeLogger.error(
      {},
      'Redis connection ended — no further reconnects; cache degraded to database fallback',
    );
  });
}

/**
 * Return the shared Redis client, creating it on first use.
 * Throws immediately on invalid `REDIS_URL` (fail-fast); a down Redis
 * server never throws here — connection happens asynchronously and the
 * retry strategy keeps reconnecting in the background.
 */
export function getRedisClient(): Redis {
  if (globalThis.__sniprlRedis) {
    return globalThis.__sniprlRedis;
  }
  const env = loadEnv();
  const redisUrl = validateRedisUrl(env.REDIS_URL);
  const redactedUrl = sanitizeRedisUrl(redisUrl);
  activeLogger.info({ redisUrl: redactedUrl }, 'Initializing Redis client singleton');
  const client = new Redis({
    ...redisOptionsFromUrl(redisUrl),
    ...buildResilienceOptions(),
  });
  attachLifecycleListeners(client, redactedUrl);
  globalThis.__sniprlRedis = client;
  return client;
}

/** Current ioredis status (`wait`/`connecting`/`ready`/`close`/`end`, or `uninitialized`). */
export function getRedisStatus(): string {
  return globalThis.__sniprlRedis?.status ?? 'uninitialized';
}

/** True only when the client exists and the server reports ready. */
export function isRedisAvailable(): boolean {
  return getRedisStatus() === 'ready';
}

/**
 * Gracefully close the singleton (used in shutdown and tests).
 * Never throws.
 */
export async function closeRedis(): Promise<void> {
  const client = globalThis.__sniprlRedis;
  globalThis.__sniprlRedis = undefined;
  reconnectAttempt = 0;
  if (!client) {
    return;
  }
  try {
    await client.quit();
    activeLogger.info({}, 'Redis client disconnected');
  } catch (err) {
    activeLogger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Redis quit failed — forcing disconnect',
    );
    client.disconnect();
  }
}

/** Test-only: drop the singleton without closing (tests use a mocked client). */
export function __resetRedisClientForTests(): void {
  globalThis.__sniprlRedis = undefined;
  reconnectAttempt = 0;
}

// ---------------------------------------------------------------------------
// Safe helpers (degradation contract: never throw)
// ---------------------------------------------------------------------------

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** GET a raw string value; `null` on miss or on any Redis failure. */
export async function cacheGet(key: string): Promise<string | null> {
  try {
    return await getRedisClient().get(key);
  } catch (err) {
    activeLogger.warn({ err: describeError(err), key }, 'Redis GET failed — using fallback');
    return null;
  }
}

/**
 * SET a raw string value, optionally with a TTL in seconds.
 * Returns `'OK'` on success, `null` when Redis is unavailable.
 */
export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<string | null> {
  try {
    const client = getRedisClient();
    if (ttlSeconds !== undefined) {
      return await client.set(key, value, 'EX', ttlSeconds);
    }
    return await client.set(key, value);
  } catch (err) {
    activeLogger.warn({ err: describeError(err), key }, 'Redis SET failed — write skipped');
    return null;
  }
}

/** DEL one or more keys; returns deleted count, `0` when Redis is unavailable. */
export async function cacheDel(...keys: string[]): Promise<number> {
  if (keys.length === 0) {
    return 0;
  }
  try {
    return await getRedisClient().del(...keys);
  } catch (err) {
    activeLogger.warn({ err: describeError(err) }, 'Redis DEL failed — delete skipped');
    return 0;
  }
}

/** INCR a counter; `null` when Redis is unavailable. */
export async function cacheIncr(key: string): Promise<number | null> {
  try {
    return await getRedisClient().incr(key);
  } catch (err) {
    activeLogger.warn({ err: describeError(err), key }, 'Redis INCR failed — using fallback');
    return null;
  }
}

/**
 * GET + JSON.parse. Corrupt values are evicted (self-heal) and yield `null`
 * so callers fall back to the database (Step 13 corrupt-cache contract).
 */
export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const raw = await cacheGet(key);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    activeLogger.warn({ key }, 'Redis value failed JSON parse — evicting corrupt entry');
    await cacheDel(key);
    return null;
  }
}

/**
 * JSON.stringify + SET (optionally with TTL). Returns `'OK'` on success,
 * `null` when the value is not serializable or Redis is unavailable.
 */
export async function cacheSetJson(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<string | null> {
  const serialized: unknown = JSON.stringify(value);
  if (typeof serialized !== 'string') {
    activeLogger.warn({ key }, 'Redis SET skipped — value is not JSON-serializable');
    return null;
  }
  return cacheSet(key, serialized, ttlSeconds);
}

/** HSET a single hash field with a JSON-serialized value. */
export async function cacheHSetJson(
  key: string,
  field: string,
  value: unknown,
): Promise<number | null> {
  const serialized: unknown = JSON.stringify(value);
  if (typeof serialized !== 'string') {
    activeLogger.warn({ key, field }, 'Redis HSET skipped — value is not JSON-serializable');
    return null;
  }
  try {
    return await getRedisClient().hset(key, { [field]: serialized });
  } catch (err) {
    activeLogger.warn({ err: describeError(err), key, field }, 'Redis HSET failed — write skipped');
    return null;
  }
}

/** HGET a single hash field with JSON deserialization; `null` on miss/failure. */
export async function cacheHGetJson<T>(key: string, field: string): Promise<T | null> {
  try {
    const raw = await getRedisClient().hget(key, field);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      activeLogger.warn({ key, field }, 'Redis hash value failed JSON parse — returning fallback');
      return null;
    }
  } catch (err) {
    activeLogger.warn(
      { err: describeError(err), key, field },
      'Redis HGET failed — using fallback',
    );
    return null;
  }
}
