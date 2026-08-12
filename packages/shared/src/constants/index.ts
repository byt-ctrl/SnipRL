export const BASE62_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const BASE62_BASE = BigInt(BASE62_ALPHABET.length);
export const SHORT_CODE_LENGTH = 7;

export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 20; // 20 link creations per hour
