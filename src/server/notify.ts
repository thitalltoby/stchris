import 'server-only';
import { db } from './db';
import { env } from './env';
import { enqueueJob, registerJob } from './jobs';
import { activeMailProvider, sendMail } from './mail';
import { getSetting } from './settings';
import { emailTemplate } from './email-templates';

export interface QueuedEmail {
  type: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
  requestId?: string;
}

/** Record the message in the outbox and queue it for delivery. Never throws into the caller's business flow. */
export async function enqueueEmail(m: QueuedEmail): Promise<string | null> {
  try {
    const ev = await db.notificationEvent.create({
      data: { type: m.type, toAddress: m.to.toLowerCase(), subject: m.subject, body: m.html ? JSON.stringify({ text: m.body, html: m.html }) : m.body, requestId: m.requestId, status: 'QUEUED' },
    });
    await enqueueJob('send_notification', { id: ev.id }, { dedupeKey: `notif:${ev.id}` });
    return ev.id;
  } catch (e) {
    console.error('[notify] could not queue email', e);
    return null;
  }
}

const MAX_ATTEMPTS = 5;

export async function deliverNotification(id: string): Promise<void> {
  const ev = await db.notificationEvent.findUnique({ where: { id } });
  if (!ev || ev.status === 'SENT' || ev.status === 'SKIPPED') return;
  let text = ev.body;
  let html: string | undefined;
  if (ev.body.startsWith('{"text"')) {
    try {
      const parsed = JSON.parse(ev.body) as { text: string; html: string };
      text = parsed.text;
      html = parsed.html;
    } catch {
      /* plain body */
    }
  }
  try {
    const r = await sendMail({ to: ev.toAddress, subject: ev.subject, text, html });
    await db.notificationEvent.update({
      where: { id },
      data: { status: r.status, provider: r.provider, providerMessageId: r.messageId, error: r.detail ?? null, attempts: { increment: 1 }, sentAt: r.status === 'SENT' ? new Date() : null },
    });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
    const attempts = ev.attempts + 1;
    await db.notificationEvent.update({ where: { id }, data: { attempts, error: msg, status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'QUEUED' } });
    throw e; // let the queue back off and retry
  }
}

registerJob('send_notification', async (p: { id: string }) => deliverNotification(p.id));

/** Who hears about new requests: the configured list, or every active Super Admin / Operations Admin. */
export async function internalRecipients(kind: 'newRequestTo' | 'approvalTo'): Promise<string[]> {
  const s = await getSetting('notifications');
  const configured = s[kind].filter(Boolean);
  if (configured.length) return configured;
  const roles = kind === 'approvalTo' ? (['APPROVER', 'SUPER_ADMIN'] as const) : (['OPS_ADMIN', 'SUPER_ADMIN'] as const);
  const users = await db.user.findMany({ where: { isActive: true, role: { in: [...roles] } }, select: { email: true } });
  return users.map((u) => u.email);
}

export async function notifyInternal(kind: 'newRequestTo' | 'approvalTo', subject: string, heading: string, paragraphs: string[], path: string, details?: [string, string][], requestId?: string, only?: string[]) {
  // A department's own address wins; otherwise the general list hears about it
  const to = only?.length ? only : await internalRecipients(kind);
  const tpl = emailTemplate({ heading, paragraphs, details, cta: { label: 'Open in the console', url: `${env.APP_URL}${path}` } });
  await Promise.all(to.map((addr) => enqueueEmail({ type: `internal.${kind}`, to: addr, subject, ...tpl, requestId })));
}

export const emailProviderName = async () => (await activeMailProvider()).name;
