import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { metricsRoutes } from './metrics.js';
import {
  getLinkCache,
  getLinkCacheHitRate,
  getLinkCacheStats,
  resetLinkCacheStats,
  setLinkCache,
  setLinkCacheLogger,
} from '../cache/linkCache.js';

// Isolate the Redis layer with an in-memory store so the REAL linkCache
// counters are exercised through the public set/get API (no real Redis).
vi.mock('../cache/redis.js', () => {
  const store = new Map<string, string>();
  return {
    cacheGetJson: vi.fn(async (key: string): Promise<unknown> => {
      const raw: string | undefined = store.get(key);
      if (raw === undefined) {
        return null;
      }
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        store.delete(key);
        return null;
      }
    }),
    cacheSetJson: vi.fn(
      async (key: string, value: unknown, _ttlSeconds?: number): Promise<string> => {
        store.set(key, JSON.stringify(value));
        return 'OK';
      },
    ),
    cacheDel: vi.fn(async (...keys: string[]): Promise<number> => {
      let removed = 0;
      for (const key of keys) {
        if (store.delete(key)) {
          removed += 1;
        }
      }
      return removed;
    }),
    setRedisLogger: vi.fn(),
  };
});

interface MetricsJsonBody {
  redirect_cache_hits: number;
  redirect_cache_misses: number;
  redirect_cache_hit_rate: number;
  uptime_seconds: number;
  timestamp: string;
}

describe('Step 14: Cache telemetry (GET /metrics)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    setLinkCacheLogger({
      debug: (): void => {},
      info: (): void => {},
      warn: (): void => {},
      error: (): void => {},
    });
    app = Fastify({ logger: false });
    await app.register(metricsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetLinkCacheStats();
  });

  it('starts at 0/0 with hit_rate 0 and JSON content-type by default', async () => {
    const response = await app.inject({ method: 'GET', url: '/metrics' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['cache-control']).toContain('no-store');

    const body: MetricsJsonBody = JSON.parse(response.body) as MetricsJsonBody;
    expect(body.redirect_cache_hits).toBe(0);
    expect(body.redirect_cache_misses).toBe(0);
    expect(body.redirect_cache_hit_rate).toBe(0);
    expect(typeof body.uptime_seconds).toBe('number');
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('reflects hits/misses driven through the public linkCache API with correct hit_rate math', async () => {
    const entry = {
      longUrl: 'https://example.com/metrics-target',
      expiresAt: null,
      maxClicks: null,
      passwordHash: null,
    };

    // 1 miss on an unknown key.
    expect(await getLinkCache('metrics-miss-1')).toBeNull();

    // 3 hits: one write followed by three reads of the same key.
    expect(await setLinkCache('metrics-hit-1', entry)).toBe('OK');
    expect(await getLinkCache('metrics-hit-1')).toEqual(entry);
    expect(await getLinkCache('metrics-hit-1')).toEqual(entry);
    expect(await getLinkCache('metrics-hit-1')).toEqual(entry);

    const stats = getLinkCacheStats();
    expect(stats).toEqual({ hits: 3, misses: 1 });
    expect(getLinkCacheHitRate()).toBe(0.75);

    const response = await app.inject({ method: 'GET', url: '/metrics' });
    expect(response.statusCode).toBe(200);

    const body: MetricsJsonBody = JSON.parse(response.body) as MetricsJsonBody;
    expect(body.redirect_cache_hits).toBe(3);
    expect(body.redirect_cache_misses).toBe(1);
    expect(body.redirect_cache_hit_rate).toBe(0.75);
  });

  it('rounds hit_rate to 4dp (2 hits / 3 total = 0.6667)', async () => {
    const entry = {
      longUrl: 'https://example.com/rounding-target',
      expiresAt: null,
      maxClicks: null,
      passwordHash: null,
    };

    expect(await getLinkCache('metrics-round-miss')).toBeNull();
    expect(await setLinkCache('metrics-round-hit', entry)).toBe('OK');
    expect(await getLinkCache('metrics-round-hit')).toEqual(entry);
    expect(await getLinkCache('metrics-round-hit')).toEqual(entry);

    expect(getLinkCacheHitRate()).toBe(0.6667);

    const response = await app.inject({ method: 'GET', url: '/metrics' });
    const body: MetricsJsonBody = JSON.parse(response.body) as MetricsJsonBody;
    expect(body.redirect_cache_hit_rate).toBe(0.6667);
  });

  it('returns Prometheus exposition when Accept: text/plain is requested', async () => {
    const entry = {
      longUrl: 'https://example.com/prom-target',
      expiresAt: null,
      maxClicks: null,
      passwordHash: null,
    };

    expect(await getLinkCache('metrics-prom-miss')).toBeNull();
    expect(await setLinkCache('metrics-prom-hit', entry)).toBe('OK');
    expect(await getLinkCache('metrics-prom-hit')).toEqual(entry);

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { accept: 'text/plain; version=0.0.4' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body.endsWith('\n')).toBe(true);

    expect(response.body).toContain('# HELP redirect_cache_hits');
    expect(response.body).toContain('# TYPE redirect_cache_hits counter');
    expect(response.body).toContain('redirect_cache_hits 1');
    expect(response.body).toContain('# HELP redirect_cache_misses');
    expect(response.body).toContain('# TYPE redirect_cache_misses counter');
    expect(response.body).toContain('redirect_cache_misses 1');
    expect(response.body).toContain('# HELP redirect_cache_hit_rate');
    expect(response.body).toContain('# TYPE redirect_cache_hit_rate gauge');
    expect(response.body).toContain('redirect_cache_hit_rate 0.5');
  });

  it('never leaks cached values (longUrl / passwordHash / tokens)', async () => {
    const entry = {
      longUrl: 'https://example.com/super-secret-target',
      expiresAt: null,
      maxClicks: null,
      passwordHash: 'hash-should-never-appear-in-metrics',
    };

    expect(await setLinkCache('metrics-leak-check', entry)).toBe('OK');
    expect(await getLinkCache('metrics-leak-check')).toEqual(entry);

    const jsonRes = await app.inject({ method: 'GET', url: '/metrics' });
    expect(jsonRes.body).not.toContain('super-secret-target');
    expect(jsonRes.body).not.toContain('hash-should-never-appear');
    expect(jsonRes.body).not.toContain('passwordHash');
    expect(jsonRes.body).not.toContain('longUrl');

    const promRes = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { accept: 'text/plain' },
    });
    expect(promRes.body).not.toContain('super-secret-target');
    expect(promRes.body).not.toContain('hash-should-never-appear');
  });
});
