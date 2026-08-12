import { z } from 'zod';

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

export function loadEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid Environment Variables:', result.error.format());
    throw new Error('Invalid environment configuration');
  }
  return result.data;
}
