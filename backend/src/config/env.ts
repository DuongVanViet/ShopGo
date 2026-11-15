import 'dotenv/config';
import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.enum(['127.0.0.1', '0.0.0.0', '::1']).default('127.0.0.1'),
    DATABASE_URL: z.string().url(),
    ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
    AUTH_SECRET: z.string().min(32),
    OTP_MODE: z.enum(['local', 'disabled']).default('disabled'),
    OTP_TTL_SECONDS: z.coerce.number().int().min(30).max(600).default(180),
    SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
    QUOTE_TTL_SECONDS: z.coerce.number().int().min(30).max(600).default(300),
    RESERVATION_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
    PICKUP_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(1800),
    PAYMENT_MODE: z.enum(['disabled', 'sandbox']).default('disabled'),
    PAYMENT_WEBHOOK_SECRET: z.string().min(32).optional(),
    WORKER_INTERVAL_MS: z.coerce.number().int().min(1000).default(10000),
    SEED_ALLOW: z.enum(['true', 'false']).default('false'),
    AI_SERVICE_URL: z.string().url().optional(),
    AI_SERVICE_TOKEN: z.string().min(32).optional(),
    AI_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(8000),
    UPLOAD_DIR: z.string().trim().min(1).default('uploads'),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      (env.OTP_MODE === 'local' || env.PAYMENT_MODE === 'sandbox')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Local OTP and sandbox payment are forbidden in production',
      });
    }
    if (env.NODE_ENV === 'production' && env.AUTH_SECRET.startsWith('replace-')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_SECRET'],
        message: 'Replace the example secret before production',
      });
    }
    if (env.PAYMENT_MODE === 'sandbox' && !env.PAYMENT_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYMENT_WEBHOOK_SECRET'],
        message: 'Required for sandbox webhook',
      });
    }
    if (env.AI_SERVICE_URL && !env.AI_SERVICE_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AI_SERVICE_TOKEN'],
        message: 'Required when AI_SERVICE_URL is configured',
      });
    }
  });
export type Env = z.infer<typeof schema>;
export function loadEnv(): Env {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  return result.data;
}
export const ENV = Symbol('ENV');
