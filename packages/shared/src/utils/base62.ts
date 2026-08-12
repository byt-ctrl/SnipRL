import { BASE62_ALPHABET, BASE62_BASE, SHORT_CODE_LENGTH } from '../constants/index.js';

/**
 * Frozen Base62 Alphabet contract: '0-9a-zA-Z' (indices 0..61)
 * Order is strictly frozen:
 *   0-9:  indices 0-9
 *   a-z:  indices 10-35
 *   A-Z:  indices 36-61
 */

/**
 * Encodes a non-negative bigint into a Base62 string.
 * Padding contract: Minimum length is SHORT_CODE_LENGTH (7 characters), padded with '0'.
 *
 * @param num Non-negative BigInt to encode
 * @returns Base62 encoded string of minimum length 7
 */
export function encodeBase62(num: bigint): string {
  if (num < 0n) {
    throw new Error('Base62 encoding requires a non-negative bigint');
  }

  if (num === 0n) {
    return BASE62_ALPHABET[0].padStart(SHORT_CODE_LENGTH, BASE62_ALPHABET[0]);
  }

  let result = '';
  let value = num;

  while (value > 0n) {
    const remainder = Number(value % BASE62_BASE);
    result = BASE62_ALPHABET[remainder] + result;
    value = value / BASE62_BASE;
  }

  return result.padStart(SHORT_CODE_LENGTH, BASE62_ALPHABET[0]);
}

/**
 * Decodes a Base62 string back into a non-negative bigint.
 *
 * @param str Base62 string to decode
 * @returns Decoded BigInt value
 */
export function decodeBase62(str: string): bigint {
  if (!str) {
    throw new Error('Cannot decode empty Base62 string');
  }

  let result = 0n;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const index = BASE62_ALPHABET.indexOf(char);

    if (index === -1) {
      throw new Error(`Invalid Base62 character: '${char}'`);
    }

    result = result * BASE62_BASE + BigInt(index);
  }

  return result;
}

// Aliases matching exact checklist method signatures
export const encode = encodeBase62;
export const decode = decodeBase62;
