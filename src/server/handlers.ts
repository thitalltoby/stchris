import 'server-only';
import { db } from './db';
import { enqueueJob, registerJob, runDueJobs } from './jobs';
import { rescanHeldDocuments } from './scan';
import { expireQuotations } from './quotations';
import { enqueueEmail } from './notify';
import { emailTemplate } from './email-templates';
import { env } from './env';
import './integrations/events'; // registers integration_event
import './social'; // registers social_publish
import { publishDueArticles } from './journal';

/** Remind assignees about follow-ups that fell due. Once per task. */
export async function sendTaskReminders(now = new Date()): Promise<number> {
  const due = await db.task.findMany({
    where: { status: 'OPEN', dueAt: { lte: now }, reminderSentAt: null, assigneeId: { not: null } },
    include: { assignee: true, request: { select: { id: true, reference: true } } },
    take: 100,
  });
  let n = 0;
  for (const t of due) {
    if (!t.assignee?.isActive) continue;
    const claimed = await db.task.updateMany({ where: { id: t.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (claimed.count !== 1) continue; // another worker got it
    await enqueueEmail({
      type: 'task.reminder',
      to: t.assignee.email,
      subject: `Follow-up due: ${t.title}`,
      requestId: t.requestId ?? undefined,
      ...emailTemplate({
        heading: 'A follow-up is due',
        paragraphs: [t.title, ...(t.notes ? [t.notes] : [])],
        cta: { label: t.request ? 'Open the request' : 'Open my follow-ups', url: `${env.APP_URL}${t.request ? `/admin/requests/${t.request.id}` : '/admin/tasks'}` },
      }),
    });
    n++;
  }
  return n;
}

registerJob('maintenance', async () => {
  await expireQuotations();
  await rescanHeldDocuments().catch((e) => console.error('[scan] rescan failed', e));
  await sendTaskReminders();
  // housekeeping: expired sessions/tokens, stale rate-limit windows, finished jobs older than 30 days
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.authToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
  await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 86_400_000) } } });
  // sign-in, reset and invitation emails carry single-use links; once delivered and past their usefulness, keep the audit row but not the link
  await db.notificationEvent.updateMany({
    where: { OR: [{ type: { startsWith: 'auth.' } }, { type: 'company.invite' }], status: { in: ['SENT', 'SKIPPED', 'FAILED'] }, createdAt: { lt: new Date(Date.now() - 3_600_000) }, NOT: { body: '[removed after delivery]' } },
    data: { body: '[removed after delivery]' },
  });
  await db.job.deleteMany({ where: { status: 'DONE', finishedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
});

/** Called every minute by the worker or the cron endpoint. Dedupe keys keep it to one maintenance run per 5-minute slot. */
export async function tick() {
  const slot = Math.floor(Date.now() / 300_000);
  await enqueueJob('maintenance', {}, { dedupeKey: `maintenance:${slot}`, maxAttempts: 2 });
  await publishDueArticles().catch((e) => console.error('[journal] scheduled publishing failed', e));
  return runDueJobs(50);
}

/** Opportunistic delivery right after a user action; the worker/cron remains the reliable path for retries. */
export async function kick() {
  try {
    await runDueJobs(10);
  } catch (e) {
    console.error('[jobs] kick failed', e);
  }
}
