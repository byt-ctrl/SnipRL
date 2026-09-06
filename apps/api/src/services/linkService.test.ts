import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLinkService, resolveRedirectService } from './linkService';
import { encodeBase62 } from '@sniprl/shared';

let currentId = 1n;
const storage = new Map<bigint, Record<string, unknown>>();

// Step 13: isolate the redirect cache so unit tests exercise the DB fallback
// (MISS) path without opening a real Redis connection. HIT-path behaviour is
// covered by `cache/linkCache.test.ts` against a mocked ioredis client.
vi.mock('../cache/linkCache.js', () => {
  return {
    LINK_CACHE_TTL_SECONDS: 86400,
    linkCacheKey: (code: string): string => `link:${code}`,
    isCachedLink: (): boolean => true,
    toCachedLink: (row: {
      longUrl: string;
      expiresAt: Date | string | null;
      maxClicks: number | null;
      passwordHash: string | null;
    }): {
      longUrl: string;
      expiresAt: string | null;
      maxClicks: number | null;
      passwordHash: string | null;
    } => ({
      longUrl: row.longUrl,
      expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
      maxClicks: row.maxClicks ?? null,
      passwordHash: row.passwordHash ?? null,
    }),
    getLinkCache: vi.fn(async () => null),
    setLinkCache: vi.fn(async () => 'OK'),
    invalidateLinkCache: vi.fn(async () => 1),
    getLinkCacheStats: (): { hits: number; misses: number } => ({ hits: 0, misses: 0 }),
    resetLinkCacheStats: vi.fn(),
    setLinkCacheLogger: vi.fn(),
  };
});

// Mock DB prisma client for unit isolation
vi.mock('../db/prisma.js', () => {
  return {
    prisma: {
      link: {
        findUnique: vi.fn(async ({ where, include }) => {
          for (const item of storage.values()) {
            if (where.shortCode && item.shortCode === where.shortCode) {
              if (include?._count) {
                return {
                  ...item,
                  _count: {
                    clickEvents: (item.clicks as number) || 0,
                  },
                };
              }
              return item;
            }
          }
          return null;
        }),
      },
      $transaction: vi.fn((callback) => {
        const fakeTx = {
          link: {
            create: vi.fn(async ({ data }) => {
              const id = currentId++;
              const record: Record<string, unknown> = {
                id,
                longUrl: data.longUrl,
                managementToken: data.managementToken,
                shortCode: data.shortCode || null,
                customAlias: data.customAlias,
                email: data.email || null,
                expiresAt: data.expiresAt || null,
                maxClicks: data.maxClicks || null,
                passwordHash: data.passwordHash || null,
                urlKey: data.urlKey || null,
                createdAt: new Date(),
                deletedAt: null,
                clicks: 0,
              };
              storage.set(id, record);
              return record;
            }),
            update: vi.fn(async ({ where, data }) => {
              const record = storage.get(where.id);
              if (!record) throw new Error('Record not found');
              if (data.shortCode) {
                record.shortCode = data.shortCode;
              }
              return record;
            }),
          },
        };
        return callback(fakeTx);
      }),
    },
  };
});

describe('Link Service Unit Tests (Step 7, Step 9, Step 10)', () => {
  beforeEach(() => {
    currentId = 1n;
    storage.clear();
  });

  describe('Link Creation & Short Code Generation', () => {
    it('transactionally inserts link, encodes BigInt ID, and updates short_code', async () => {
      const result = await createLinkService({
        longUrl: 'https://example.com/test-1',
      });

      expect(result.shortCode).toBe('0000001');
      expect(result.shortCode).toBe(encodeBase62(1n));
      expect(result.managementToken).toBeDefined();
      expect(result.managementToken.length).toBeGreaterThanOrEqual(40);
      expect(result.shortUrl).toBe(`http://localhost:3000/0000001`);
    });

    it('Verify: inserting 5 links yields 5 distinct short codes', async () => {
      const generatedCodes = new Set<string>();

      for (let i = 1; i <= 5; i++) {
        const link = await createLinkService({
          longUrl: `https://example.com/item-${i}`,
        });

        expect(link.shortCode).toBeDefined();
        expect(link.shortCode.length).toBe(7);
        generatedCodes.add(link.shortCode);
      }

      // Must yield 5 distinct short codes
      expect(generatedCodes.size).toBe(5);
    });

    it('preserves custom alias when explicitly provided', async () => {
      const result = await createLinkService({
        longUrl: 'https://example.com/custom',
        customAlias: 'my-custom-link',
      });

      expect(result.shortCode).toBe('my-custom-link');
      expect(result.shortUrl).toBe('http://localhost:3000/my-custom-link');
    });

    it('throws 409 Conflict when custom alias is already in use', async () => {
      await createLinkService({
        longUrl: 'https://example.com/first',
        customAlias: 'duplicate-alias',
      });

      await expect(
        createLinkService({
          longUrl: 'https://example.com/second',
          customAlias: 'duplicate-alias',
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        name: 'Conflict',
      });
    });
  });

  describe('Redirect Resolution (Step 10 Hot Path)', () => {
    it('resolves destination URL for an active link', async () => {
      const created = await createLinkService({
        longUrl: 'https://example.com/destination',
        customAlias: 'active-link',
      });

      const resolved = await resolveRedirectService(created.shortCode);
      expect(resolved.longUrl).toBe('https://example.com/destination');
    });

    it('throws 404 for an unknown shortCode', async () => {
      await expect(resolveRedirectService('unknown999')).rejects.toMatchObject({
        statusCode: 404,
        name: 'NotFound',
      });
    });

    it('throws 404 for a soft-deleted link', async () => {
      const created = await createLinkService({
        longUrl: 'https://example.com/deleted',
        customAlias: 'deleted-link',
      });

      // Soft delete in storage
      for (const item of storage.values()) {
        if (item.shortCode === created.shortCode) {
          item.deletedAt = new Date();
        }
      }

      await expect(resolveRedirectService(created.shortCode)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('throws 410 Gone for an expired link', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const created = await createLinkService({
        longUrl: 'https://example.com/expired',
        customAlias: 'expired-link',
        expiresAt: pastDate,
      });

      await expect(resolveRedirectService(created.shortCode)).rejects.toMatchObject({
        statusCode: 410,
        message: 'This short link has expired',
      });
    });

    it('throws 410 Gone when maximum click limit is reached', async () => {
      const created = await createLinkService({
        longUrl: 'https://example.com/limited',
        customAlias: 'limited-link',
        maxClicks: 5,
      });

      // Simulate 5 clicks in storage
      for (const item of storage.values()) {
        if (item.shortCode === created.shortCode) {
          item.clicks = 5;
        }
      }

      await expect(resolveRedirectService(created.shortCode)).rejects.toMatchObject({
        statusCode: 410,
        message: 'This short link has reached its maximum click limit',
      });
    });

    it('throws 403 Forbidden for password protected link scaffold', async () => {
      const created = await createLinkService({
        longUrl: 'https://example.com/protected',
        customAlias: 'protected-link',
        password: 'secure-password-123',
      });

      await expect(resolveRedirectService(created.shortCode)).rejects.toMatchObject({
        statusCode: 403,
        message: 'This link is password protected',
      });
    });
  });
});
