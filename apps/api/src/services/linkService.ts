import { prisma } from '../db/prisma.js';
import {
  encodeBase62,
  normalizeUrl,
  CreateLinkInput,
  CreateLinkResponse,
  UpdateLinkInput,
  LinkStatsResponse,
} from '@sniprl/shared';
import { generateManagementToken, hashPassword, timingSafeTokenEqual } from '../utils/security.js';
import { loadEnv } from '../config/env.js';
import {
  getLinkCache,
  invalidateLinkCache,
  setLinkCache,
  toCachedLink,
} from '../cache/linkCache.js';
import type { CachedLink } from '../cache/linkCache.js';
import type { RedisLogger } from '../cache/redis.js';

export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string, name = 'Error') {
    super(message);
    this.statusCode = statusCode;
    this.name = name;
  }
}

export interface CreateLinkOptions {
  stripUtm?: boolean;
  stripFragment?: boolean;
}

/**
 * ARCHITECTURAL RATIONALE: SHORT-CODE GENERATION SCHEME
 * ----------------------------------------------------
 * UUID/Random Hash schemes were evaluated and explicitly rejected for the following reasons:
 * 1. Code Length & UX: Random hashes (e.g. MD5/SHA-256 slices or UUIDs) require longer strings
 *    or risk severe collision probabilities. Base62 ID encoding produces minimal 7-character codes.
 * 2. Collision Overhead: Random hash schemes require a check-and-retry loop against the DB on
 *    duplicate key errors, degrading database throughput under heavy concurrent write operations.
 * 3. Guaranteed Uniqueness: Encoding the auto-incrementing BigInt primary key using Base62 inside
 *    a single ACID database transaction guarantees 100% mathematical uniqueness with zero retry loops,
 *    supporting up to 3.52 trillion distinct short URLs (62^7 - 1) before exceeding 7 characters.
 */

export async function createLinkService(
  input: CreateLinkInput,
  options: CreateLinkOptions = {},
): Promise<CreateLinkResponse> {
  const env = loadEnv();

  // 1. Normalize the longUrl
  const normalizedLongUrl = normalizeUrl(input.longUrl, options);

  // 2. Generate high-entropy management token
  const managementToken = generateManagementToken();

  // 3. Hash password if provided
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  // 4. If custom alias is requested, check if it's already taken
  if (input.customAlias) {
    const existing = await prisma.link.findUnique({
      where: { shortCode: input.customAlias },
    });

    if (existing) {
      throw new HttpError(409, `Custom alias '${input.customAlias}' is already in use`, 'Conflict');
    }
  }

  // 5. Transactional insert & short code generation
  const link = await prisma.$transaction(async (tx) => {
    // A. Initial insert
    const initialLink = await tx.link.create({
      data: {
        longUrl: normalizedLongUrl,
        managementToken,
        customAlias: Boolean(input.customAlias),
        email: input.email || null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        maxClicks: input.maxClicks || null,
        passwordHash,
        shortCode: input.customAlias ? input.customAlias : null,
      },
    });

    // B. If custom alias was provided, short code is already set
    if (input.customAlias) {
      return initialLink;
    }

    // C. Convert autoincremented BigInt primary key to Base62 code
    const generatedShortCode = encodeBase62(initialLink.id);

    // D. Update short_code in the same ACID transaction
    const updatedLink = await tx.link.update({
      where: { id: initialLink.id },
      data: { shortCode: generatedShortCode },
    });

    return updatedLink;
  });

  const shortCode = link.shortCode!;
  const shortUrl = `${env.APP_BASE_URL}/${shortCode}`;

  // Step 13 write-through: populate `link:{shortCode}` after commit.
  // Never throws (degrades when Redis is down); built from the merged DB row.
  await setLinkCache(shortCode, toCachedLink(link));

  return {
    shortCode,
    shortUrl,
    managementToken: link.managementToken,
    createdAt: link.createdAt.toISOString(),
  };
}

/**
 * Resolves a redirect lookup for a given shortCode on the hot path.
 * Validates expiration, max click limit, password protection, and deletion state.
 *
 * Step 13 cache-aside: HIT serves from `link:{shortCode}` (enforcing
 * `expiresAt`/`passwordHash` from cache, plus a lightweight DB count check
 * when `maxClicks != null`), refreshes the 24h sliding TTL, and returns a
 * 302 payload immediately. MISS/corrupt/outage falls back to the DB and
 * repopulates the cache. An optional logger enables request-scoped hit/miss
 * debug logs (only the cache key is ever logged); omitted for backward
 * compatibility with existing callers/tests.
 *
 * NOTE: Click telemetry recording will be hooked asynchronously in Step 15 via Redis Stream.
 */
export async function resolveRedirectService(
  shortCode: string,
  logger?: RedisLogger,
): Promise<{ longUrl: string }> {
  // 0. Cache-aside HIT path (miss/corrupt/outage -> null -> DB fallback below).
  const cached: CachedLink | null = await getLinkCache(shortCode, logger);

  if (cached !== null) {
    // 0a. Expiry enforced from cache. Expired entries are evicted and
    // surface 410 without refreshing the TTL.
    if (cached.expiresAt !== null) {
      const expiresMs = Date.parse(cached.expiresAt);
      if (!Number.isNaN(expiresMs) && Date.now() > expiresMs) {
        await invalidateLinkCache(shortCode, logger);
        throw new HttpError(410, 'This short link has expired', 'Gone');
      }
    }

    // 0b. Password scaffold parity: presence of a hash blocks the redirect.
    if (cached.passwordHash) {
      throw new HttpError(403, 'This link is password protected', 'Forbidden');
    }

    // 0c. maxClicks cannot be enforced from the cached scalar alone because
    // clicks live in `click_events`. Revalidate with a lightweight DB count
    // read so 410 stays accurate; also catches a soft-delete that raced a
    // missed DEL. On DB outage, fail open to the cached redirect (the cache
    // already passed expiry/password checks).
    if (cached.maxClicks !== null) {
      try {
        const revalidation = await prisma.link.findUnique({
          where: { shortCode },
          include: {
            _count: {
              select: { clickEvents: true },
            },
          },
        });

        if (!revalidation || revalidation.deletedAt !== null) {
          await invalidateLinkCache(shortCode, logger);
          throw new HttpError(404, 'Short link not found', 'NotFound');
        }

        const liveClicks = revalidation._count?.clickEvents ?? 0;
        const liveMax = revalidation.maxClicks ?? null;
        if (liveMax !== null && liveMax !== undefined && liveClicks >= liveMax) {
          throw new HttpError(410, 'This short link has reached its maximum click limit', 'Gone');
        }
      } catch (err) {
        if (err instanceof HttpError) {
          throw err;
        }
        // DB unavailable during revalidation: fail open to cached redirect.
      }
    }

    // 0d. Sliding TTL refresh (SET EX 86400) then serve from cache.
    await setLinkCache(shortCode, cached, logger);
    return {
      longUrl: cached.longUrl,
    };
  }

  const link = await prisma.link.findUnique({
    where: { shortCode },
    include: {
      _count: {
        select: { clickEvents: true },
      },
    },
  });

  // 1. Check existence and soft-deletion
  if (!link || link.deletedAt !== null) {
    throw new HttpError(404, 'Short link not found', 'NotFound');
  }

  // 2. Check expiration timestamp
  if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
    throw new HttpError(410, 'This short link has expired', 'Gone');
  }

  // 3. Check maximum click limit
  if (
    link.maxClicks !== null &&
    link.maxClicks !== undefined &&
    (link._count?.clickEvents ?? 0) >= link.maxClicks
  ) {
    throw new HttpError(410, 'This short link has reached its maximum click limit', 'Gone');
  }

  // 4. Password protection scaffold (full verification flow deferred to Step 44)
  if (link.passwordHash) {
    throw new HttpError(403, 'This link is password protected', 'Forbidden');
  }

  // 5. MISS populate: cache the DB row for the next redirect (never throws).
  await setLinkCache(shortCode, toCachedLink(link), logger);

  return {
    longUrl: link.longUrl,
  };
}

/**
 * Find a link by its short code (case-insensitive due to citext column constraint).
 */
export async function getLinkByShortCode(shortCode: string) {
  return prisma.link.findUnique({
    where: { shortCode },
  });
}

/**
 * Verifies the provided management token against the stored token
 * using constant-time comparison. Never logs token values.
 * Throws 401 when missing or invalid.
 */
function requireManagementAuth(providedToken: string | null, storedToken: string): void {
  if (!providedToken || !timingSafeTokenEqual(providedToken, storedToken)) {
    throw new HttpError(401, 'Invalid or missing management token', 'Unauthorized');
  }
}

/**
 * Step 11: Returns link metadata + total click counts (token-authenticated).
 */
export async function getLinkStatsService(
  shortCode: string,
  providedToken: string | null,
): Promise<LinkStatsResponse> {
  const link = await prisma.link.findUnique({
    where: { shortCode },
    include: {
      _count: {
        select: { clickEvents: true },
      },
    },
  });

  // 1. Existence + soft-deletion → 404 (same semantics as redirect path)
  if (!link || link.deletedAt !== null) {
    throw new HttpError(404, 'Short link not found', 'NotFound');
  }

  // 2. Token auth → 401 (constant-time, no token in logs/errors)
  requireManagementAuth(providedToken, link.managementToken);

  return {
    shortCode: link.shortCode!,
    longUrl: link.longUrl,
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    maxClicks: link.maxClicks ?? null,
    totalClicks: link._count?.clickEvents ?? 0,
  };
}

/**
 * Step 11: Updates longUrl / expiresAt / maxClicks / email (token-authenticated).
 * Validation is enforced at the route layer with updateLinkSchema, which mirrors
 * createLinkSchema rules; longUrl is re-normalized exactly as in creation.
 */
export async function updateLinkService(
  shortCode: string,
  providedToken: string | null,
  input: UpdateLinkInput,
  options: CreateLinkOptions = {},
): Promise<{
  shortCode: string;
  longUrl: string;
  expiresAt: string | null;
  maxClicks: number | null;
  email: string | null;
  createdAt: string;
}> {
  const existing = await prisma.link.findUnique({
    where: { shortCode },
  });

  // 1. Existence + soft-deletion → 404
  if (!existing || existing.deletedAt !== null) {
    throw new HttpError(404, 'Short link not found', 'NotFound');
  }

  // 2. Token auth → 401
  requireManagementAuth(providedToken, existing.managementToken);

  // 3. Build partial update payload (undefined = leave unchanged, null = clear)
  const data: {
    longUrl?: string;
    expiresAt?: Date | null;
    maxClicks?: number | null;
    email?: string | null;
  } = {};

  if (input.longUrl !== undefined) {
    data.longUrl = normalizeUrl(input.longUrl, options);
  }
  if (input.expiresAt !== undefined) {
    data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  }
  if (input.maxClicks !== undefined) {
    data.maxClicks = input.maxClicks;
  }
  if (input.email !== undefined) {
    data.email = input.email;
  }

  const updated = await prisma.link.update({
    where: { id: existing.id },
    data,
  });

  // Step 13 write-through: refresh `link:{shortCode}` from the merged DB row
  // (not just the PATCH input) so the next redirect serves fresh values.
  // Never throws; a Redis outage leaves the DB as source of truth.
  await setLinkCache(updated.shortCode!, toCachedLink(updated));

  return {
    shortCode: updated.shortCode!,
    longUrl: updated.longUrl,
    expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
    maxClicks: updated.maxClicks ?? null,
    email: updated.email ?? null,
    createdAt: updated.createdAt.toISOString(),
  };
}

/**
 * Step 11: Soft-deletes a link (token-authenticated).
 * Sets `deletedAt = now()`; row is preserved for audit/retention.
 * `deleted_at` column + migration already exist (see init_schema migration);
 * no new migration required. Redirect/stats/update treat soft-deleted
 * rows as 404, so a second DELETE also yields 404 (soft-deleted as absent).
 */
export async function deleteLinkService(
  shortCode: string,
  providedToken: string | null,
): Promise<void> {
  const existing = await prisma.link.findUnique({
    where: { shortCode },
  });

  // 1. Existence + soft-deletion → 404
  if (!existing || existing.deletedAt !== null) {
    throw new HttpError(404, 'Short link not found', 'NotFound');
  }

  // 2. Token auth → 401 (constant-time, no token in logs/errors)
  requireManagementAuth(providedToken, existing.managementToken);

  // 3. Soft delete via timestamp update (never hard-deletes here;
  // hard purge is a retention job, Step 38).
  await prisma.link.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() },
  });

  // Step 13: evict `link:{shortCode}` so the next redirect is a cache MISS
  // and falls back to the DB (which now reports 404). Never throws.
  await invalidateLinkCache(shortCode);
}
