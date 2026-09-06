import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  __resetRedisClientForTests,
  cacheDel,
  cacheGet,
  cacheGetJson,
  cacheHGetJson,
  cacheHSetJson,
  cacheIncr,
  cacheSet,
  cacheSetJson,
  closeRedis,
  computeRetryDelay,
  getRedisClient,
  getRedisStatus,
  isRedisAvailable,
  redisOptionsFromUrl,
  sanitizeRedisUrl,
  setRedisLogger,
  validateRedisUrl,
} from './redis';

// ---------------------------------------------------------------------------
// Fake ioredis client: in-memory store, controllable outage flag, and
// a minimal event emitter so lifecycle wiring can be exercised.
// ---------------------------------------------------------------------------

type Listener = (...args: unknown[]) => void;

interface FakeRedisOptions {
  host?: string;
  port?: number;
  db?: number;
  username?: string;
  password?: string;
  tls?: unknown;
  enableOfflineQueue?: boolean;
  maxRetriesPerRequest?: number;
  retryStrategy?: (times: number) => number;
  reconnectOnError?: (err: Error) => boolean | 1 | 2;
}

interface FakeRedisHandle {
  status: string;
  shouldFail: boolean;
  store: Map<string, string>;
  capturedOptions: FakeRedisOptions;
  emit(event: string, ...args: unknown[]): boolean;
  listenerCount(event: string): number;
}

vi.mock('ioredis', () => {
  class FakeRedis {
    status = 'connecting';
    shouldFail = false;
    store = new Map<string, string>();
    hashes = new Map<string, Map<string, string>>();
    capturedOptions: Record<string, unknown>;
    private listeners = new Map<string, Listener[]>();

    constructor(options?: Record<string, unknown>) {
      this.capturedOptions = options ?? {};
      const g = globalThis as unknown as { __fakeRedisInstances?: unknown[] };
      g.__fakeRedisInstances ??= [];
      g.__fakeRedisInstances.push(this);
    }

    on(event: string, fn: Listener): this {
      const list = this.listeners.get(event) ?? [];
      list.push(fn);
      this.listeners.set(event, list);
      return this;
    }

    emit(event: string, ...args: unknown[]): boolean {
      const list = this.listeners.get(event) ?? [];
      for (const fn of list) {
        fn(...args);
      }
      return list.length > 0;
    }

    listenerCount(event: string): number {
      return this.listeners.get(event)?.length ?? 0;
    }

    private failIfDown(): void {
      if (this.shouldFail) {
        throw new Error('connect ECONNREFUSED 127.0.0.1:6379');
      }
    }

    async get(key: string): Promise<string | null> {
      this.failIfDown();
      return this.store.get(key) ?? null;
    }

    async set(key: string, value: string): Promise<string> {
      this.failIfDown();
      this.store.set(key, value);
      return 'OK';
    }

    async del(...keys: string[]): Promise<number> {
      this.failIfDown();
      let removed = 0;
      for (const key of keys) {
        if (this.store.delete(key)) {
          removed += 1;
        }
      }
      return removed;
    }

    async incr(key: string): Promise<number> {
      this.failIfDown();
      const next = Number(this.store.get(key) ?? '0') + 1;
      this.store.set(key, String(next));
      return next;
    }

    async hset(key: string, obj: Record<string, string>): Promise<number> {
      this.failIfDown();
      let hash = this.hashes.get(key);
      if (!hash) {
        hash = new Map<string, string>();
        this.hashes.set(key, hash);
      }
      let added = 0;
      for (const [field, value] of Object.entries(obj)) {
        if (!hash.has(field)) {
          added += 1;
        }
        hash.set(field, value);
      }
      return added;
    }

    async hget(key: string, field: string): Promise<string | null> {
      this.failIfDown();
      return this.hashes.get(key)?.get(field) ?? null;
    }

    async quit(): Promise<string> {
      this.status = 'end';
      return 'OK';
    }

    disconnect(): void {
      this.status = 'end';
    }
  }

  return { Redis: FakeRedis };
});

function fakeInstances(): FakeRedisHandle[] {
  const g = globalThis as unknown as { __fakeRedisInstances?: FakeRedisHandle[] };
  return g.__fakeRedisInstances ?? [];
}

function lastFake(): FakeRedisHandle {
  const all = fakeInstances();
  const latest = all[all.length - 1];
  if (!latest) {
    throw new Error('expected a FakeRedis instance to exist');
  }
  return latest;
}

interface LogEntry {
  level: string;
  obj: unknown;
  msg?: string;
}

let logs: LogEntry[] = [];

beforeEach(() => {
  logs = [];
  const g = globalThis as unknown as { __fakeRedisInstances?: FakeRedisHandle[] };
  g.__fakeRedisInstances = [];
  __resetRedisClientForTests();
  setRedisLogger({
    debug: (obj: unknown, msg?: string) => {
      logs.push({ level: 'debug', obj, msg });
    },
    info: (obj: unknown, msg?: string) => {
      logs.push({ level: 'info', obj, msg });
    },
    warn: (obj: unknown, msg?: string) => {
      logs.push({ level: 'warn', obj, msg });
    },
    error: (obj: unknown, msg?: string) => {
      logs.push({ level: 'error', obj, msg });
    },
  });
});

describe('Step 12: Redis client layer', () => {
  describe('validateRedisUrl (fail-fast config)', () => {
    it('accepts redis:// and rediss:// URLs', () => {
      expect(validateRedisUrl('redis://localhost:6379')).toBe('redis://localhost:6379');
      expect(validateRedisUrl('rediss://:pw@redis.example.com:6380/2')).toBe(
        'rediss://:pw@redis.example.com:6380/2',
      );
    });

    it('rejects empty, unparseable, and non-redis protocols', () => {
      expect(() => validateRedisUrl('')).toThrow('REDIS_URL must be a non-empty string');
      expect(() => validateRedisUrl(undefined)).toThrow('REDIS_URL must be a non-empty string');
      expect(() => validateRedisUrl('not-a-url')).toThrow('not a parseable URL');
      expect(() => validateRedisUrl('http://localhost:6379')).toThrow(
        'must use redis:// or rediss://',
      );
    });

    it('never leaks credentials in validation errors', () => {
      try {
        validateRedisUrl('http://:s3cret-pw@localhost:6379');
        expect.unreachable();
      } catch (err) {
        expect(String(err)).not.toContain('s3cret-pw');
      }
    });
  });

  describe('sanitizeRedisUrl', () => {
    it('redacts passwords for logging', () => {
      const redacted = sanitizeRedisUrl('redis://:s3cret-pw@localhost:6379/0');
      expect(redacted).not.toContain('s3cret-pw');
      expect(redacted).toContain('REDACTED');
    });
  });

  describe('redisOptionsFromUrl', () => {
    it('maps a full rediss:// URL to explicit options', () => {
      const options = redisOptionsFromUrl('rediss://user:pw@redis.example.com:6380/2');
      expect(options.host).toBe('redis.example.com');
      expect(options.port).toBe(6380);
      expect(options.db).toBe(2);
      expect(options.username).toBe('user');
      expect(options.password).toBe('pw');
      expect(options.tls).toBeDefined();
    });

    it('applies localhost defaults for a bare URL', () => {
      const options = redisOptionsFromUrl('redis://localhost:6379');
      expect(options.host).toBe('localhost');
      expect(options.port).toBe(6379);
      expect(options.db).toBe(0);
      expect(options.tls).toBeUndefined();
    });

    it('rejects unparseable ports and out-of-range databases', () => {
      // The WHATWG URL parser itself rejects ports outside 1-65535.
      expect(() => redisOptionsFromUrl('redis://localhost:99999')).toThrow('not a parseable URL');
      expect(() => redisOptionsFromUrl('redis://localhost:6379/abc')).toThrow('must be a number');
      expect(() => redisOptionsFromUrl('redis://localhost:6379/-1')).toThrow('must be a number');
    });
  });

  describe('computeRetryDelay (backoff)', () => {
    it('starts small and stays within jitter bounds', () => {
      const first = computeRetryDelay(1);
      expect(first).toBeGreaterThanOrEqual(50);
      expect(first).toBeLessThanOrEqual(249);
    });

    it('caps the exponential growth', () => {
      const late = computeRetryDelay(30);
      expect(late).toBeGreaterThanOrEqual(2000);
      expect(late).toBeLessThanOrEqual(2199);
      const huge = computeRetryDelay(1000);
      expect(huge).toBeLessThanOrEqual(2199);
    });
  });

  describe('singleton + lifecycle logging', () => {
    it('returns the same instance and wires all lifecycle listeners', () => {
      const first = getRedisClient();
      const second = getRedisClient();
      expect(second).toBe(first);
      expect(fakeInstances()).toHaveLength(1);

      const client = lastFake();
      for (const event of ['connect', 'ready', 'error', 'close', 'reconnecting', 'end']) {
        expect(client.listenerCount(event)).toBeGreaterThanOrEqual(1);
      }
    });

    it('passes fail-fast resilience options to the client', () => {
      getRedisClient();
      const options = lastFake().capturedOptions;
      expect(options.host).toBe('localhost');
      expect(options.port).toBe(6379);
      expect(options.enableOfflineQueue).toBe(false);
      expect(options.maxRetriesPerRequest).toBe(3);
      expect(typeof options.retryStrategy).toBe('function');
    });

    it('logs connect/ready/error/close/reconnecting/end events', () => {
      getRedisClient();
      const client = lastFake();

      client.emit('connect');
      client.emit('ready');
      client.emit('error', new Error('boom'));
      client.emit('close');
      client.emit('reconnecting', 500);
      client.emit('end');

      const messages = logs.map((entry) => entry.msg ?? '');
      expect(messages).toContain('Redis connected');
      expect(messages).toContain('Redis ready to accept commands');
      expect(messages).toContain('Redis error');
      expect(messages).toContain('Redis connection closed');
      expect(messages).toContain('Redis reconnecting');
      expect(messages).toContain(
        'Redis connection ended — no further reconnects; cache degraded to database fallback',
      );
    });

    it('retryStrategy logs the attempt and always returns a reconnect delay', () => {
      getRedisClient();
      const retry = lastFake().capturedOptions.retryStrategy;
      if (!retry) {
        throw new Error('retryStrategy was not configured');
      }
      const delay = retry(3);
      expect(delay).toBeGreaterThanOrEqual(200);
      expect(delay).toBeLessThanOrEqual(399);
      expect(logs.some((entry) => entry.msg?.includes('scheduling reconnect'))).toBe(true);
    });

    it('reconnectOnError triggers only for READONLY failover errors', () => {
      getRedisClient();
      const reconnectOnError = lastFake().capturedOptions.reconnectOnError;
      if (!reconnectOnError) {
        throw new Error('reconnectOnError was not configured');
      }
      expect(
        reconnectOnError(new Error('READONLY You cannot write against a read only replica')),
      ).toBe(true);
      expect(reconnectOnError(new Error('connect ECONNREFUSED'))).toBe(false);
    });
  });

  describe('helpers (degradation contract: never throw)', () => {
    it('round-trips strings, JSON, counters, and hashes', async () => {
      expect(await cacheSet('k:string', 'hello', 60)).toBe('OK');
      expect(await cacheGet('k:string')).toBe('hello');

      expect(await cacheSetJson('k:json', { a: 1 })).toBe('OK');
      expect(await cacheGetJson<{ a: number }>('k:json')).toEqual({ a: 1 });

      expect(await cacheIncr('k:counter')).toBe(1);
      expect(await cacheIncr('k:counter')).toBe(2);

      expect(await cacheHSetJson('k:hash', 'field', { b: 2 })).toBe(1);
      expect(await cacheHGetJson<{ b: number }>('k:hash', 'field')).toEqual({ b: 2 });

      expect(await cacheDel('k:string', 'k:json')).toBe(2);
      expect(await cacheGet('k:string')).toBeNull();
    });

    it('evicts corrupt JSON values and falls back to null', async () => {
      await cacheSet('k:corrupt', 'not-json{');
      expect(await cacheGetJson('k:corrupt')).toBeNull();
      // Self-healed: the corrupt entry was deleted.
      expect(await cacheGet('k:corrupt')).toBeNull();
      expect(logs.some((entry) => entry.msg?.includes('evicting corrupt entry'))).toBe(true);
    });

    it('returns fallbacks instead of throwing during a Redis outage', async () => {
      getRedisClient();
      lastFake().shouldFail = true;

      await expect(cacheGet('k')).resolves.toBeNull();
      await expect(cacheSet('k', 'v')).resolves.toBeNull();
      await expect(cacheDel('k')).resolves.toBe(0);
      await expect(cacheIncr('k')).resolves.toBeNull();
      await expect(cacheGetJson('k')).resolves.toBeNull();
      await expect(cacheSetJson('k', { a: 1 })).resolves.toBeNull();
      await expect(cacheHSetJson('k', 'f', { a: 1 })).resolves.toBeNull();
      await expect(cacheHGetJson('k', 'f')).resolves.toBeNull();
    });
  });

  describe('availability + shutdown', () => {
    it('reports uninitialized/ready status correctly', () => {
      expect(getRedisStatus()).toBe('uninitialized');
      expect(isRedisAvailable()).toBe(false);
      getRedisClient();
      expect(isRedisAvailable()).toBe(false);
      lastFake().status = 'ready';
      expect(getRedisStatus()).toBe('ready');
      expect(isRedisAvailable()).toBe(true);
    });

    it('closeRedis drops the singleton so the next use rebuilds it', async () => {
      getRedisClient();
      await closeRedis();
      expect(getRedisStatus()).toBe('uninitialized');
      getRedisClient();
      expect(fakeInstances()).toHaveLength(2);
    });
  });
});
