import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from './app';
import { FastifyInstance } from 'fastify';

// Mock DB prisma client for integration testing
vi.mock('./db/prisma.js', () => {
  return {
    prisma: {
      $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
      $disconnect: vi.fn(async () => {}),
    },
  };
});

describe('Step 8: Application Bootstrap Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    app = buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

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
