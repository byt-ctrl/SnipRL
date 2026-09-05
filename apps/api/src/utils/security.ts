import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/**
 * Generates a high-entropy 256-bit cryptographically secure management token.
 * Encoded as URL-safe Base64 string (43 chars).
 */
export function generateManagementToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hashes a plaintext password using scrypt with a random salt.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Constant-time management-token comparison.
 * Never throws on length mismatch: performs a dummy constant-time
 * comparison instead, so callers don't leak the expected length
 * through early-return timing (Cloudflare timingSafeEqual pattern).
 */
export function timingSafeTokenEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Dummy compare to keep timing constant; always false here.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Extracts a `Bearer <token>` value from an Authorization header.
 * Returns null when missing or malformed. Never logs the token value.
 */
export function extractBearerToken(authorizationHeader: unknown): string | null {
  if (typeof authorizationHeader !== 'string') return null;
  const [scheme, token] = authorizationHeader.split(' ');
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Verifies a plaintext password against a stored scrypt hash.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;

  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;

  if (keyBuffer.length !== derivedKey.length) return false;
  return timingSafeEqual(keyBuffer, derivedKey);
}
