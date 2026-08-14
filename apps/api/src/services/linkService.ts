import { prisma } from '../db/prisma.js';
import { encodeBase62, normalizeUrl, CreateLinkInput, CreateLinkResponse } from '@sniprl/shared';
import { generateManagementToken, hashPassword } from '../utils/security.js';
import { loadEnv } from '../config/env.js';

export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string, name = 'Error') {
    super(message);
    this.statusCode = statusCode;
    this.name = name;
  }
}

export interface CreateLinkOptions {
  stripUtm?: boolean;
  stripFragment?: boolean;
}

/**
 * ARCHITECTURAL RATIONALE: SHORT-CODE GENERATION SCHEME
 * ----------------------------------------------------
 * UUID/Random Hash schemes were evaluated and explicitly rejected for the following reasons:
 * 1. Code Length & UX: Random hashes (e.g. MD5/SHA-256 slices or UUIDs) require longer strings
 *    or risk severe collision probabilities. Base62 ID encoding produces minimal 7-character codes.
 * 2. Collision Overhead: Random hash schemes require a check-and-retry loop against the DB on
 *    duplicate key errors, degrading database throughput under heavy concurrent write operations.
 * 3. Guaranteed Uniqueness: Encoding the auto-incrementing BigInt primary key using Base62 inside
 *    a single ACID database transaction guarantees 100% mathematical uniqueness with zero retry loops,
 *    supporting up to 3.52 trillion distinct short URLs (62^7 - 1) before exceeding 7 characters.
 */

export async function createLinkService(
  input: CreateLinkInput,
  options: CreateLinkOptions = {},
): Promise<CreateLinkResponse> {
  const env = loadEnv();

  // 1. Normalize the longUrl
  const normalizedLongUrl = normalizeUrl(input.longUrl, options);

  // 2. Generate high-entropy management token
  const managementToken = generateManagementToken();

  // 3. Hash password if provided
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  // 4. If custom alias is requested, check if it's already taken
  if (input.customAlias) {
    const existing = await prisma.link.findUnique({
      where: { shortCode: input.customAlias },
    });

    if (existing) {
      throw new HttpError(409, `Custom alias '${input.customAlias}' is already in use`, 'Conflict');
    }
  }

  // 5. Transactional insert & short code generation
  const link = await prisma.$transaction(async (tx) => {
    // A. Initial insert
    const initialLink = await tx.link.create({
      data: {
        longUrl: normalizedLongUrl,
        managementToken,
        customAlias: Boolean(input.customAlias),
        email: input.email || null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        maxClicks: input.maxClicks || null,
        passwordHash,
        shortCode: input.customAlias ? input.customAlias : null,
      },
    });

    // B. If custom alias was provided, short code is already set
    if (input.customAlias) {
      return initialLink;
    }

    // C. Convert autoincremented BigInt primary key to Base62 code
    const generatedShortCode = encodeBase62(initialLink.id);

    // D. Update short_code in the same ACID transaction
    const updatedLink = await tx.link.update({
      where: { id: initialLink.id },
      data: { shortCode: generatedShortCode },
    });

    return updatedLink;
  });

  const shortCode = link.shortCode!;
  const shortUrl = `${env.APP_BASE_URL}/${shortCode}`;

  return {
    shortCode,
    shortUrl,
    managementToken: link.managementToken,
    createdAt: link.createdAt.toISOString(),
  };
}

/**
 * Find a link by its short code (case-insensitive due to citext column constraint).
 */
export async function getLinkByShortCode(shortCode: string) {
  return prisma.link.findUnique({
    where: { shortCode },
  });
}
