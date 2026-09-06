/**
 * Step 13 — Link redirect cache (cache-aside over `link:{shortCode}`).
 *
 * Key scheme: `link:{shortCode}` -> JSON
 * `{ longUrl: string, expiresAt: string|null (ISO), maxClicks: number|null,
 *    passwordHash: string|null }`
 *
 * Behaviour:
 * - TTL 24h (86400s), refreshed on every HIT via `SET EX 86400` (sliding).
 * - HIT: enforce `expiresAt` / `passwordHash` from the cached value, then
 *   delegate the `maxClicks` live-count check to the caller (the click count
 *   lives in the DB and cannot be enforced from the cached scalar alone).
 *   On success the caller refreshes the TTL with `setLinkCache`.
 * - MISS / corrupt / outage: caller falls back to the DB, then populates
 *   the cache with `setLinkCache`.
 * - Write-through: create/update persist to the DB first, then refresh the
 *   cache from the merged DB row. Delete evicts via `invalidateLinkCache`.
 * - Corrupt entries (missing / wrong-type fields) are evicted and treated
 *   as a MISS, never a 500.
 *
 * Tradeoff (maxClicks): the cached `maxClicks` scalar alone cannot enforce
 * the limit because clicks live in `click_events`. On a HIT with
 * `maxClicks != null` the service performs one lightweight DB read
 * (`findUnique` with `_count` only) to enforce 410 accurately and to detect
 * a soft-delete that raced a missed DEL. If that revalidation read fails
 * (DB outage) the service fails open to the cached redirect, provided the
 * cache already passed the expiry / password checks (degradation contract).
 * Links without `maxClicks` serve HITs with zero DB reads; deletion relies
 * on DEL-on-delete (plus natural TTL expiry as a safety net).
 *
 * Privacy: keys (`link:{shortCode}`) may be logged at debug level; values
 * (`longUrl`, `passwordHash`) are never logged and never attached to error
 * objects. Pino redaction already covers `passwordHash`.
 *
 * Degradation: every wrapper delegates to the never-throw `cache*Json`
 * helpers in `./redis.js`, so a Redis outage, misconfiguration, or corrupt
 * value degrades to a DB fallback instead of failing the request.
 */

import { cacheDel, cacheGetJson, cacheSetJson } from './redis.js';
import type { RedisLogger } from './redis.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sliding TTL for redirect entries: 24 hours in seconds. */
export const LINK_CACHE_TTL_SECONDS = 86400;

/** Key prefix for redirect entries. */
const LINK_CACHE_PREFIX = 'link:';

// ---------------------------------------------------------------------------
// Logging (follows `redis.ts` active-logger pattern; values never logged)
// ---------------------------------------------------------------------------

function consoleLoggerMethod(level: 'debug' | 'info' | 'warn' | 'error') {
  return (obj: unknown, msg?: string): void => {
    console[level](`[linkCache] ${msg ?? ''}`, obj);
  };
}

let activeLogger: RedisLogger = {
  debug: consoleLoggerMethod('debug'),
  info: consoleLoggerMethod('info'),
  warn: consoleLoggerMethod('warn'),
  error: consoleLoggerMethod('error'),
};

/**
 * Route link-cache debug logs through a custom logger
 * (e.g. the Fastify Pino instance via `setLinkCacheLogger(app.log)`).
 * Only cache keys are ever logged, never cached values.
 */
export function setLinkCacheLogger(logger: RedisLogger): void {
  activeLogger = logger;
}

function resolveLogger(logger?: RedisLogger): RedisLogger {
  return logger ?? activeLogger;
}

// ---------------------------------------------------------------------------
// Counters (in-memory hit/miss telemetry; Step 14 exposes them)
// ---------------------------------------------------------------------------

let linkCacheHits = 0;
let linkCacheMisses = 0;

export interface LinkCacheStats {
  hits: number;
  misses: number;
}

/** Current in-memory hit/miss counters for the redirect cache. */
export function getLinkCacheStats(): LinkCacheStats {
  return { hits: linkCacheHits, misses: linkCacheMisses };
}

/** Test-only: reset the in-memory hit/miss counters. */
export function resetLinkCacheStats(): void {
  linkCacheHits = 0;
  linkCacheMisses = 0;
}

// ---------------------------------------------------------------------------
// Key + value shape
// ---------------------------------------------------------------------------

/** Namespaced cache key for a short code. */
export function linkCacheKey(shortCode: string): string {
  return `${LINK_CACHE_PREFIX}${shortCode}`;
}

/** Cached redirect payload stored at `link:{shortCode}`. */
export interface CachedLink {
  longUrl: string;
  /** ISO-8601 timestamp or null when the link never expires. */
  expiresAt: string | null;
  maxClicks: number | null;
  passwordHash: string | null;
}

/**
 * Narrowing validator for cache reads. Returns false for missing or
 * wrong-type fields so callers can evict + fall back to the DB (never 500).
 */
export function isCachedLink(value: unknown): value is CachedLink {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.longUrl !== 'string' || candidate.longUrl.length === 0) {
    return false;
  }

  const expiresAt: unknown = candidate.expiresAt;
  if (expiresAt !== null) {
    if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) {
      return false;
    }
  }

  const maxClicks: unknown = candidate.maxClicks;
  if (maxClicks !== null) {
    if (typeof maxClicks !== 'number' || !Number.isInteger(maxClicks) || maxClicks < 0) {
      return false;
    }
  }

  const passwordHash: unknown = candidate.passwordHash;
  if (passwordHash !== null) {
    if (typeof passwordHash !== 'string' || passwordHash.length === 0) {
      return false;
    }
  }

  return true;
}

/** DB row surface needed to build a cache entry (merged row, not input). */
export interface LinkCacheSourceRow {
  longUrl: string;
  expiresAt: Date | string | null;
  maxClicks: number | null;
  passwordHash: string | null;
}

/**
 * Build a `CachedLink` from a persisted DB row. Callers must pass the merged
 * row returned by Prisma (post-create / post-update), never raw user input.
 */
export function toCachedLink(row: LinkCacheSourceRow): CachedLink {
  let expiresAt: string | null = null;
  if (row.expiresAt instanceof Date) {
    expiresAt = row.expiresAt.toISOString();
  } else if (typeof row.expiresAt === 'string') {
    expiresAt = row.expiresAt;
  }
  return {
    longUrl: row.longUrl,
    expiresAt,
    maxClicks: row.maxClicks ?? null,
    passwordHash: row.passwordHash ?? null,
  };
}

// ---------------------------------------------------------------------------
// Wrappers (never throw; degrade to null / 0 on Redis failure)
// ---------------------------------------------------------------------------

/**
 * Read a redirect entry. HIT returns a validated `CachedLink`; MISS, corrupt
 * values, and Redis outages return `null` so the caller falls back to the DB.
 * Corrupt entries are evicted (self-heal). Only the key is logged, at debug.
 */
export async function getLinkCache(
  shortCode: string,
  logger?: RedisLogger,
): Promise<CachedLink | null> {
  const log = resolveLogger(logger);
  const key = linkCacheKey(shortCode);

  const raw = await cacheGetJson<CachedLink>(key);
  if (raw === null) {
    linkCacheMisses += 1;
    log.debug({ key, hits: linkCacheHits, misses: linkCacheMisses }, 'Link cache miss');
    return null;
  }

  if (!isCachedLink(raw)) {
    linkCacheMisses += 1;
    log.debug(
      { key, hits: linkCacheHits, misses: linkCacheMisses },
      'Link cache corrupt — evicted, falling back to database',
    );
    await cacheDel(key);
    return null;
  }

  linkCacheHits += 1;
  log.debug({ key, hits: linkCacheHits, misses: linkCacheMisses }, 'Link cache hit');
  return raw;
}

/**
 * Write (or refresh) a redirect entry with the sliding 24h TTL.
 * Fire-and-forget safe: resolves `null` when Redis is unavailable or the
 * value is invalid, and never throws. Only the key is logged, at debug.
 */
export async function setLinkCache(
  shortCode: string,
  value: CachedLink,
  logger?: RedisLogger,
): Promise<string | null> {
  const log = resolveLogger(logger);
  const key = linkCacheKey(shortCode);

  if (!isCachedLink(value)) {
    log.warn({ key }, 'Link cache write skipped — value failed validation');
    return null;
  }

  const result = await cacheSetJson(key, value, LINK_CACHE_TTL_SECONDS);
  log.debug({ key }, 'Link cache write');
  return result;
}

/**
 * Evict a redirect entry (called after soft-delete and on expiry-on-HIT).
 * Never throws; resolves the deleted count (`0` when Redis is unavailable).
 */
export async function invalidateLinkCache(
  shortCode: string,
  logger?: RedisLogger,
): Promise<number> {
  const log = resolveLogger(logger);
  const key = linkCacheKey(shortCode);
  const removed = await cacheDel(key);
  log.debug({ key }, 'Link cache invalidated');
  return removed;
}
