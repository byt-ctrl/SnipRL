import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from './app';
import { FastifyInstance } from 'fastify';

let mockId = 1n;
const linkStore = new Map<bigint, Record<string, unknown>>();

// Mock DB prisma client for integration testing
vi.mock('./db/prisma.js', () => {
  return {
    prisma: {
      $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
      $disconnect: vi.fn(async () => {}),
      link: {
        findUnique: vi.fn(async ({ where }) => {
          for (const item of linkStore.values()) {
            if (where.shortCode && item.shortCode === where.shortCode) {
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

describe('API Integration Tests (Step 8 & Step 9)', () => {
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
});
