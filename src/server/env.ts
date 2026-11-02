import { z } from 'zod';

const bool = (d: boolean) =>
  z.string().optional().transform((v) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  EMAIL_FROM: z.string().default('St. Chris Materials Desk <desk@example.com>'),
  RESEND_API_KEY: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_SECURE: bool(false),
  STORAGE_DIR: z.string().default('./storage'),
  CRON_SECRET: z.string().optional().default(''),
  AUTH_REQUIRE_EMAIL_VERIFICATION: bool(true),
  TRUST_PROXY: bool(false),
  /** ClamAV daemon (clamd) for upload scanning. Empty = built-in checks only. */
  CLAMAV_HOST: z.string().optional().default(''),
  CLAMAV_PORT: z.coerce.number().optional().default(3310),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated lazily so `next build` does not need runtime secrets. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration — ${msg}`);
  }
  if (parsed.data.NODE_ENV === 'production') {
    if (/change-me|example|secret-secret/i.test(parsed.data.APP_SECRET)) throw new Error('Invalid environment configuration — APP_SECRET is still a placeholder. Generate one with: openssl rand -base64 48');
    if (!/^https:\/\//.test(parsed.data.APP_URL) && !/localhost|127\.0\.0\.1/.test(parsed.data.APP_URL)) throw new Error('Invalid environment configuration — APP_URL must use https:// in production.');
  }
  cached = parsed.data;
  return cached;
}

export const env = new Proxy({} as Env, {
  get: (_t, key: string) => getEnv()[key as keyof Env],
});
