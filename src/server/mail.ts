import 'server-only';
import { db } from './db';
import { decryptJson } from './crypto';
import { env } from './env';
import { sendWithConfig, type EmailConfig, type MailInput, type MailResult } from './integrations/providers/email';

export type { MailInput, MailResult };

export type MailProviderName = 'resend' | 'postmark' | 'sendgrid' | 'smtp' | 'none';

interface Resolved { name: MailProviderName; source: 'console' | 'server' | 'none'; config?: EmailConfig }

/**
 * Which sender is active. Settings saved and switched on in the console (Integrations → Email delivery) win;
 * otherwise the server's environment variables (RESEND_API_KEY or SMTP_*) are used.
 */
async function resolve(): Promise<Resolved> {
  try {
    const row = await db.integration.findUnique({ where: { key: 'email' } });
    if (row?.enabled) {
      const c = row.config as unknown as EmailConfig;
      const secrets = decryptJson(row.secretEnc) ?? {};
      if (c.provider && c.from) return { name: c.provider, source: 'console', config: { ...c, apiKey: secrets.apiKey, pass: secrets.pass } };
    }
  } catch (e) {
    console.error('[mail] could not read the console email settings; falling back to server settings', e);
  }
  if (env.RESEND_API_KEY) return { name: 'resend', source: 'server', config: { provider: 'resend', from: env.EMAIL_FROM, apiKey: env.RESEND_API_KEY } };
  if (env.SMTP_HOST) return { name: 'smtp', source: 'server', config: { provider: 'smtp', from: env.EMAIL_FROM, host: env.SMTP_HOST, port: String(env.SMTP_PORT), secure: env.SMTP_SECURE ? 'true' : 'false', user: env.SMTP_USER, pass: env.SMTP_PASS } };
  return { name: 'none', source: 'none' };
}

export async function activeMailProvider(): Promise<{ name: MailProviderName; source: Resolved['source'] }> {
  const r = await resolve();
  return { name: r.name, source: r.source };
}

/**
 * Send one message through the active provider. Throws on provider failure so the job queue can retry.
 * "SENT" means the provider accepted the message; it is not proof of delivery to the inbox.
 */
export async function sendMail(m: MailInput): Promise<MailResult> {
  const r = await resolve();
  if (!r.config) {
    // Local development convenience only: show the message so sign-up and reset links can be followed without a mail provider.
    if (process.env.NODE_ENV === 'development') console.info(`[mail:dev] To: ${m.to}\n[mail:dev] Subject: ${m.subject}\n${m.text}`);
    return { status: 'SKIPPED', provider: 'none', detail: 'No email provider is configured (Integrations → Email delivery, or RESEND_API_KEY / SMTP_HOST on the server).' };
  }
  return sendWithConfig(r.config, m);
}
