import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from './app';
import { FastifyInstance } from 'fastify';

let mockId = 1n;
const linkStore = new Map<bigint, Record<string, unknown>>();

// Step 13: isolate the redirect cache so integration tests exercise the DB
// fallback (MISS) path without opening a real Redis connection.
vi.mock('./cache/linkCache.js', () => {
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
    getLinkCacheHitRate: (): number => 0,
    resetLinkCacheStats: vi.fn(),
    setLinkCacheLogger: vi.fn(),
  };
});

// Mock DB prisma client for integration testing
vi.mock('./db/prisma.js', () => {
  return {
    prisma: {
      $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
      $disconnect: vi.fn(async () => {}),
      link: {
        findUnique: vi.fn(async ({ where, include }) => {
          for (const item of linkStore.values()) {
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
              const id = mockId++;
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
              linkStore.set(id, record);
              return record;
            }),
            update: vi.fn(async ({ where, data }) => {
              const record = linkStore.get(where.id);
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

describe('API Integration Tests (Step 8, Step 9, Step 10)', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    app = buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Step 8: Bootstrap & Health', () => {
    it('GET /health returns 200 { ok: true, db: "up" } when DB is healthy', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
      expect(body.db).toBe('up');
      expect(body.timestamp).toBeDefined();
    });

    it('Unknown route returns structured 404 JSON', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/non-existent-endpoint',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.statusCode).toBe(404);
      expect(body.error).toBe('Not Found');
      expect(body.message).toContain('Route GET /api/v1/non-existent-endpoint not found');
    });

    it('Propagates x-request-id header on responses', async () => {
      const customReqId = 'test-req-id-12345';
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'x-request-id': customReqId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-request-id']).toBe(customReqId);
    });
  });

  describe('Step 9: Link Creation Endpoint (POST /api/links)', () => {
    it('successfully creates a short link and returns management token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/links',
        payload: {
          longUrl: 'https://example.com/very/long/url/path?utm_source=twitter',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.shortCode).toBeDefined();
      expect(body.shortUrl).toContain(body.shortCode);
      expect(body.managementToken).toBeDefined();
      expect(body.managementToken.length).toBeGreaterThanOrEqual(40);
      expect(body.createdAt).toBeDefined();
    });

    it('rejects invalid URL with 400 Bad Request and field-level error', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/links',
        payload: {
          longUrl: 'not-a-valid-url',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
      expect(body.message).toBe('Validation failed');
      expect(body.issues).toBeDefined();
      expect(body.issues[0].path).toBe('longUrl');
    });

    it('rejects embedded credentials in longUrl with 400 Bad Request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/links',
        payload: {
          longUrl: 'http://user:pass@example.com/login',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
      expect(body.issues[0].path).toBe('longUrl');
    });

    it('rejects reserved custom aliases with 400 Bad Request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/links',
        payload: {
          longUrl: 'https://example.com/dashboard',
          customAlias: 'admin',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
      expect(body.issues[0].path).toBe('customAlias');
      expect(body.issues[0].message).toContain('reserved');
    });
  });

  describe('Step 10: Redirect Endpoint (GET /:shortCode)', () => {
    it('redirects with 302, correct Location, and Cache-Control: no-store on active link', async () => {
      // 1. Create a link
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/links',
        payload: {
          longUrl: 'https://example.com/target-redirect-page',
          customAlias: 'redirect-target',
        },
      });
      expect(createRes.statusCode).toBe(201);

      // 2. Perform GET /:shortCode
      const redirectRes = await app.inject({
        method: 'GET',
        url: '/redirect-target',
      });

      expect(redirectRes.statusCode).toBe(302);
      expect(redirectRes.headers.location).toBe('https://example.com/target-redirect-page');
      expect(redirectRes.headers['cache-control']).toContain('no-store');
    });

    it('returns 404 for unknown shortCode', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/unknown-code-12345',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.statusCode).toBe(404);
      expect(body.message).toBe('Short link not found');
    });

    it('returns 410 Gone for expired link', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      await app.inject({
        method: 'POST',
        url: '/api/links',
        payload: {
          longUrl: 'https://example.com/expired-page',
          customAlias: 'expired-code',
          expiresAt: pastDate,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/expired-code',
      });

      expect(response.statusCode).toBe(410);
      const body = JSON.parse(response.body);
      expect(body.statusCode).toBe(410);
      expect(body.message).toBe('This short link has expired');
    });

    it('returns 410 Gone for link that reached maxClicks', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/links',
        payload: {
          longUrl: 'https://example.com/maxclicks-page',
          customAlias: 'maxclicks-code',
          maxClicks: 3,
        },
      });

      // Simulate 3 clicks in memory
      for (const item of linkStore.values()) {
        if (item.shortCode === 'maxclicks-code') {
          item.clicks = 3;
        }
      }

      const response = await app.inject({
        method: 'GET',
        url: '/maxclicks-code',
      });

      expect(response.statusCode).toBe(410);
      const body = JSON.parse(response.body);
      expect(body.statusCode).toBe(410);
      expect(body.message).toBe('This short link has reached its maximum click limit');
    });

    it('returns 403 Forbidden for password protected link scaffold', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/links',
        payload: {
          longUrl: 'https://example.com/secret-page',
          customAlias: 'secret-code',
          password: 'super-secret-password',
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/secret-code',
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.statusCode).toBe(403);
      expect(body.message).toBe('This link is password protected');
    });
  });
});
