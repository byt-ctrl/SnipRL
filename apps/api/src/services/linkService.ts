import { prisma } from '../db/prisma.js';
import { encodeBase62 } from '@sniprl/shared';
import { Link } from '@prisma/client';

export interface CreateLinkParams {
  longUrl: string;
  managementToken: string;
  customAlias?: string;
  expiresAt?: Date | null;
  maxClicks?: number | null;
  email?: string | null;
  passwordHash?: string | null;
  urlKey?: string | null;
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

export async function createLink(params: CreateLinkParams): Promise<Link> {
  return prisma.$transaction(async (tx) => {
    // 1. Initial insert into links table
    const initialLink = await tx.link.create({
      data: {
        longUrl: params.longUrl,
        managementToken: params.managementToken,
        customAlias: Boolean(params.customAlias),
        email: params.email,
        expiresAt: params.expiresAt,
        maxClicks: params.maxClicks,
        passwordHash: params.passwordHash,
        urlKey: params.urlKey,
        shortCode: params.customAlias ? params.customAlias : null,
      },
    });

    // 2. If a custom alias was specified, short_code is already set to customAlias
    if (params.customAlias) {
      return initialLink;
    }

    // 3. Convert generated auto-incrementing BigInt ID to Base62 short code
    const generatedShortCode = encodeBase62(initialLink.id);

    // 4. Atomic update of short_code within the same transaction
    const updatedLink = await tx.link.update({
      where: { id: initialLink.id },
      data: { shortCode: generatedShortCode },
    });

    return updatedLink;
  });
}

/**
 * Find a link by its short code (case-insensitive due to citext column constraint).
 */
export async function getLinkByShortCode(shortCode: string): Promise<Link | null> {
  return prisma.link.findUnique({
    where: { shortCode },
  });
}
