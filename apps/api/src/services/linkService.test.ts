import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLink } from './linkService';
import { encodeBase62 } from '@sniprl/shared';

let currentId = 1n;
const storage = new Map<bigint, Record<string, unknown>>();

// Mock DB prisma client for unit isolation
vi.mock('../db/prisma.js', () => {
  return {
    prisma: {
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

describe('Step 7: Short-Code Generation and Uniqueness', () => {
  beforeEach(() => {
    currentId = 1n;
    storage.clear();
  });

  it('transactionally inserts link, encodes BigInt ID, and updates short_code', async () => {
    const result = await createLink({
      longUrl: 'https://example.com/test-1',
      managementToken: 'tok_abc123',
    });

    expect(result.id).toBe(1n);
    expect(result.shortCode).toBe('0000001');
    expect(result.shortCode).toBe(encodeBase62(1n));
  });

  it('Verify: inserting 5 links yields 5 distinct short codes', async () => {
    const generatedCodes = new Set<string>();

    for (let i = 1; i <= 5; i++) {
      const link = await createLink({
        longUrl: `https://example.com/item-${i}`,
        managementToken: `tok_batch_${i}`,
      });

      expect(link.shortCode).toBeDefined();
      expect(link.shortCode?.length).toBe(7);
      generatedCodes.add(link.shortCode!);
    }

    // Must yield 5 distinct short codes
    expect(generatedCodes.size).toBe(5);
  });

  it('preserves custom alias when explicitly provided', async () => {
    const result = await createLink({
      longUrl: 'https://example.com/custom',
      managementToken: 'tok_custom_1',
      customAlias: 'my-custom-link',
    });

    expect(result.customAlias).toBe(true);
    expect(result.shortCode).toBe('my-custom-link');
  });
});
