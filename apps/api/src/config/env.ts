import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

// Load .env file from apps/api or repository root if present
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .transform((v) => Number(v))
    .default('3000'),
  DATABASE_URL: z
    .string()
    .default('postgresql://sniprl:sniprl@localhost:5432/sniprl?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  APP_BASE_URL: z.string().default('http://localhost:3000'),
  PUBLIC_SITE_URL: z.string().default('http://localhost:5173'),
  IP_SALT: z.string().default('dev-salt-12345'),
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedEnv: EnvConfig | null = null;

export function loadEnv(): EnvConfig {
  if (cachedEnv) {
    return cachedEnv;
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid Environment Variables:', result.error.format());
    throw new Error('Invalid environment configuration');
  }

  // Ensure process.env has the populated/defaulted values for libraries like Prisma
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = result.data.DATABASE_URL;
  }
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = result.data.NODE_ENV;
  }

  cachedEnv = result.data;
  return result.data;
}
