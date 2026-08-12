import { describe, it, expect } from 'vitest';
import { encode, decode, encodeBase62, decodeBase62 } from './base62';
import { BASE62_ALPHABET, SHORT_CODE_LENGTH } from '../constants/index';

describe('Base62 Encoding Module (Step 6)', () => {
  it('uses the frozen 0-9a-zA-Z alphabet', () => {
    expect(BASE62_ALPHABET).toBe('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(BASE62_ALPHABET.length).toBe(62);
  });

  it('enforces the 7-character padding contract for small IDs', () => {
    const encoded0 = encode(0n);
    const encoded1 = encode(1n);
    const encoded61 = encode(61n);

    expect(encoded0).toBe('0000000');
    expect(encoded0.length).toBe(SHORT_CODE_LENGTH);

    expect(encoded1).toBe('0000001');
    expect(encoded1.length).toBe(SHORT_CODE_LENGTH);

    expect(encoded61).toBe('000000Z');
    expect(encoded61.length).toBe(SHORT_CODE_LENGTH);
  });

  it('correctly handles boundary values: 1, 62, and (62^7 - 1)', () => {
    // Boundary 1
    const val1 = 1n;
    const enc1 = encode(val1);
    expect(enc1).toBe('0000001');
    expect(decode(enc1)).toBe(val1);

    // Boundary 62
    const val62 = 62n;
    const enc62 = encode(val62);
    expect(enc62).toBe('0000010');
    expect(decode(enc62)).toBe(val62);

    // Boundary (62^7 - 1) = 3,521,614,606,207
    const max7Char = 62n ** 7n - 1n;
    expect(max7Char).toBe(3521614606207n);
    const encMax7 = encode(max7Char);
    expect(encMax7).toBe('ZZZZZZZ');
    expect(decode(encMax7)).toBe(max7Char);
  });

  it('property test: round-trips random 64-bit BigInt values', () => {
    for (let i = 0; i < 200; i++) {
      // Generate random 64-bit BigInt value
      const high = BigInt(Math.floor(Math.random() * 0xffffffff));
      const low = BigInt(Math.floor(Math.random() * 0xffffffff));
      const randomVal = (high << 32n) | low;

      const encoded = encode(randomVal);
      const decoded = decode(encoded);

      expect(decoded).toBe(randomVal);
    }
  });

  it('aliases encodeBase62 and decodeBase62 function names', () => {
    expect(encodeBase62(100n)).toBe(encode(100n));
    expect(decodeBase62('000001C')).toBe(decode('000001C'));
  });

  it('throws an error for negative numbers', () => {
    expect(() => encode(-5n)).toThrow('Base62 encoding requires a non-negative bigint');
  });

  it('throws an error for invalid Base62 characters or empty inputs', () => {
    expect(() => decode('')).toThrow('Cannot decode empty Base62 string');
    expect(() => decode('000!123')).toThrow("Invalid Base62 character: '!'");
    expect(() => decode('abc@def')).toThrow("Invalid Base62 character: '@'");
  });
});
