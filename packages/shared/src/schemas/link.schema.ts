import { z } from 'zod';

export const RESERVED_ALIASES = new Set([
  'admin',
  'api',
  'health',
  'metrics',
  'dashboard',
  'privacy',
  'terms',
  'login',
  'register',
  'auth',
  'static',
  'assets',
]);

export const customAliasSchema = z
  .string()
  .min(3, 'Custom alias must be at least 3 characters')
  .max(30, 'Custom alias must be at most 30 characters')
  .regex(/^[a-zA-Z0-9-]+$/, 'Custom alias can only contain letters, numbers, and hyphens')
  .refine((val) => !RESERVED_ALIASES.has(val.toLowerCase()), {
    message: 'This custom alias is reserved and cannot be used',
  });

export const createLinkSchema = z.object({
  longUrl: z
    .string()
    .trim()
    .url('Invalid URL format')
    .max(2048, 'URL must not exceed 2048 characters')
    .refine(
      (url) => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'URL protocol must be http or https' },
    ),
  customAlias: customAliasSchema.optional(),
  expiresAt: z
    .string()
    .datetime({ message: 'expiresAt must be a valid ISO datetime string' })
    .optional(),
  maxClicks: z.number().int().positive('maxClicks must be a positive integer').optional(),
  email: z.string().email('Invalid email address').optional(),
  password: z.string().min(4, 'Password must be at least 4 characters').optional(),
});

export const updateLinkSchema = z.object({
  longUrl: z
    .string()
    .trim()
    .url('Invalid URL format')
    .max(2048, 'URL must not exceed 2048 characters')
    .optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  maxClicks: z.number().int().positive().nullable().optional(),
  email: z.string().email().nullable().optional(),
});

export type CreateLinkInput = z.infer<typeof createLinkSchema>;
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;
