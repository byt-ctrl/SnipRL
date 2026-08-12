import { BASE62_ALPHABET, BASE62_BASE, SHORT_CODE_LENGTH } from '../constants/index.js';

/**
 * Encodes a positive bigint into a Base62 string.
 * Padded to a minimum length of SHORT_CODE_LENGTH (7 characters).
 *
 * @param num Non-negative BigInt to encode
 * @returns Base62 encoded string
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
 * Decodes a Base62 string back into a bigint.
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
