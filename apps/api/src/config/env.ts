import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(8),
  ACCESS_TOKEN_TTL: z.string().default('1h'),
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGINS: z.string().optional(),
  REDIS_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  METRICS_TOKEN: z.string().optional(),
  ALLOW_DEV_RESET_TOKEN: z.preprocess(
    (value) => value === '1' || value === 'true' || value === true,
    z.boolean().default(false)
  ),
  RATE_LIMIT_STRICT: z.preprocess(
    (value) => value === '1' || value === 'true' || value === true,
    z.boolean().default(false)
  ),
  TRUST_PROXY: z.preprocess(
    (value) => value === '1' || value === 'true' || value === true,
    z.boolean().default(false)
  )
});

const parsed = envSchema.parse(process.env);

if (parsed.NODE_ENV === 'production') {
  if (!parsed.CORS_ORIGINS || parsed.CORS_ORIGINS.trim().length === 0) {
    throw new Error('CORS_ORIGINS is required in production');
  }
  if (parsed.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
}

export const env = parsed;
