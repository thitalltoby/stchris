import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/server/db';
import { verifyLogin, registerCustomer, verifyEmailToken, requestPasswordReset, resetPassword, changePassword } from '@/server/auth';
import { createStaffUser, updateUser } from '@/server/users';
import { createSession, getSessionUser, SESSION_COOKIE } from '@/server/session';
import { rateLimit } from '@/server/rate-limit';
import { enqueueJob, registerJob, runDueJobs } from '@/server/jobs';
import { tick } from '@/server/handlers';
import { submitRequest, changeStatus } from '@/server/requests';
import { dashboard, requestsCsv, parseRange, pct, MIN_SAMPLE } from '@/server/reports';
import { saveService, saveServiceField } from '@/server/content';
import { encryptJson } from '@/server/crypto';
import { listIntegrations, saveIntegration } from '@/server/integrations';
import { AppError } from '@/server/errors';
import { __jar } from '../next-headers-stub';
import { resetDb, makeUser, makeService, principal, submission, PASSWORD } from './helpers';

const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof AppError ? e.code : `ERR:${e}`));
const tokenFromMail = async (to: string, type: string) => {
  const m = await db.notificationEvent.findFirstOrThrow({ where: { toAddress: to, type }, orderBy: { createdAt: 'desc' } });
  return /token=([\w-]+)/.exec(m.body)![1]!;
};

beforeEach(async () => {
  await resetDb();
  __jar.clear();
});

describe('sign-in', () => {
  it('accepts the right password on the right door only', async () => {
    const staff = await makeUser('COMMERCIAL', { email: 'c@example.test' });
    const cust = await makeUser('CUSTOMER', { email: 'u@example.test' });
    expect(await verifyLogin('C@Example.test', PASSWORD, 'staff')).toMatchObject({ ok: true, userId: staff.id });
    expect(await verifyLogin('u@example.test', PASSWORD, 'customer')).toMatchObject({ ok: true, userId: cust.id });
    // a customer cannot use the staff door and vice versa, and the error does not say why
    const a = await verifyLogin('u@example.test', PASSWORD, 'staff');
    const b = await verifyLogin('c@example.test', PASSWORD, 'customer');
    const wrong = await verifyLogin('c@example.test', 'nope-nope-1', 'staff');
    expect(a).toEqual(wrong);
    expect(b).toEqual(wrong);
  });

  it('gives the same answer for unknown accounts as for wrong passwords', async () => {
    await makeUser('COMMERCIAL', { email: 'c@example.test' });
    expect(await verifyLogin('ghost@example.test', 'whatever-1234', 'staff')).toEqual(await verifyLogin('c@example.test', 'whatever-1234', 'staff'));
  });

  it('locks the account after repeated failures, even for the correct password', async () => {
    await makeUser('COMMERCIAL', { email: 'c@example.test' });
    for (let i = 0; i < 8; i++) await verifyLogin('c@example.test', 'wrong-pass-1', 'staff');
    const r = await verifyLogin('c@example.test', PASSWORD, 'staff');
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/locked/i);
  });

  it('refuses deactivated users', async () => {
    await makeUser('COMMERCIAL', { email: 'c@example.test', isActive: false });
    expect((await verifyLogin('c@example.test', PASSWORD, 'staff')).ok).toBe(false);
  });

  it('throttles by address', async () => {
    const out: boolean[] = [];
    for (let i = 0; i < 12; i++) out.push((await verifyLogin('spray@example.test', 'x-pass-12345', 'staff')).ok);
    expect(out.every((x) => !x)).toBe(true);
    const last = await verifyLogin('spray@example.test', 'x-pass-12345', 'staff');
    expect((last as { error: string }).error).toMatch(/too many/i);
  });
});

describe('sessions', () => {
  it('stores only a hash of the session token, and rejects expired or revoked sessions', async () => {
    const u = await makeUser('COMMERCIAL');
    await createSession(u);
    const token = __jar.get(SESSION_COOKIE)!;
    expect(token).toBeTruthy();
    const row = await db.session.findFirstOrThrow({ where: { userId: u.id } });
    expect(row.tokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
    expect((await getSessionUser())?.id).toBe(u.id);

    await db.session.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getSessionUser()).toBeNull();
  });

  it('ends sessions when a user is deactivated or their role changes', async () => {
    const admin = await makeUser('SUPER_ADMIN');
    const staff = await makeUser('COMMERCIAL');
    await createSession(staff);
    expect(await db.session.count({ where: { userId: staff.id } })).toBe(1);
    await updateUser(principal(admin), staff.id, { role: 'OPS_ADMIN' });
    expect(await db.session.count({ where: { userId: staff.id } })).toBe(0);
  });
});

describe('registration, verification and reset', () => {
  it('requires email verification before the account is trusted, and tokens are single-use', async () => {
    const { userId } = await registerCustomer({ name: 'Ada', email: 'ada@example.test', password: PASSWORD, companyName: 'Ada Ltd' });
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt).toBeNull();
    const t = await tokenFromMail('ada@example.test', 'auth.verify_email');
    expect(await verifyEmailToken('not-a-token')).toBe(false);
    expect(await verifyEmailToken(t)).toBe(true);
    expect(await verifyEmailToken(t)).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt).not.toBeNull();
  });

  it('does not reveal whether an address is already registered', async () => {
    await makeUser('CUSTOMER', { email: 'taken@example.test' });
    const r = await registerCustomer({ name: 'Someone', email: 'taken@example.test', password: PASSWORD, companyName: 'X Ltd' });
    expect(r.userId).toBeTruthy();
    expect(await db.user.count({ where: { email: 'taken@example.test' } })).toBe(1);
    expect(await db.notificationEvent.count({ where: { toAddress: 'taken@example.test', type: 'auth.already_registered' } })).toBe(1);
  });

  it('enforces the password policy on sign-up and reset', async () => {
    expect(await code(registerCustomer({ name: 'Ada', email: 'a@example.test', password: 'short1', companyName: 'X' }))).toBe('VALIDATION');
    expect(await code(resetPassword('whatever', 'short'))).toBe('VALIDATION');
  });

  it('resets a password once, signs the user out everywhere, and says nothing about unknown addresses', async () => {
    const u = await makeUser('CUSTOMER', { email: 'u@example.test' });
    await createSession(u);
    await requestPasswordReset('ghost@example.test');
    expect(await db.notificationEvent.count({ where: { type: 'auth.password_reset' } })).toBe(0);
    await requestPasswordReset('u@example.test');
    const t = await tokenFromMail('u@example.test', 'auth.password_reset');
    await resetPassword(t, 'A-brand-new-pass-77');
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    expect(await code(resetPassword(t, 'Another-new-pass-88'))).toBe('VALIDATION'); // single use
    expect((await verifyLogin('u@example.test', 'A-brand-new-pass-77', 'customer')).ok).toBe(true);
    expect((await verifyLogin('u@example.test', PASSWORD, 'customer')).ok).toBe(false);
  });

  it('rate-limits reset requests per address', async () => {
    await makeUser('CUSTOMER', { email: 'u@example.test' });
    for (let i = 0; i < 6; i++) await requestPasswordReset('u@example.test');
    expect(await db.notificationEvent.count({ where: { type: 'auth.password_reset' } })).toBe(3);
  });

  it('needs the current password to change it', async () => {
    const u = await makeUser('CUSTOMER');
    expect(await code(changePassword(u.id, 'wrong-current-1', 'Brand-new-pass-1'))).toBe('VALIDATION');
    expect(await code(changePassword(u.id, PASSWORD, 'Brand-new-pass-1'))).toBe('OK');
  });

  it('removes link-carrying email bodies once they are delivered and old', async () => {
    await makeUser('CUSTOMER', { email: 'u@example.test' });
    await requestPasswordReset('u@example.test');
    const m = await db.notificationEvent.findFirstOrThrow({ where: { type: 'auth.password_reset' } });
    await db.notificationEvent.update({ where: { id: m.id }, data: { status: 'SENT', createdAt: new Date(Date.now() - 2 * 3_600_000) } });
    await tick();
    await runDueJobs(50);
    expect((await db.notificationEvent.findUniqueOrThrow({ where: { id: m.id } })).body).toBe('[removed after delivery]');
  });
});

describe('user management', () => {
  it('invites staff by one-time link, never by emailing a password', async () => {
    const admin = await makeUser('SUPER_ADMIN');
    await createStaffUser(principal(admin), { name: 'New Staff', email: 'new@example.test', role: 'OPS_STAFF' });
    const mail = await db.notificationEvent.findFirstOrThrow({ where: { toAddress: 'new@example.test' } });
    expect(mail.body).toMatch(/reset-password\?token=/);
    expect(mail.body).not.toMatch(/temporary password|your password is/i);
    expect(await code(createStaffUser(principal(admin), { name: 'Dupe', email: 'NEW@example.test', role: 'OPS_STAFF' }))).toBe('CONFLICT');
  });

  it('only the Super Admin can manage users, and the last one cannot be removed', async () => {
    const admin = await makeUser('SUPER_ADMIN');
    const ops = await makeUser('OPS_ADMIN');
    expect(await code(createStaffUser(principal(ops), { name: 'X Person', email: 'x@example.test', role: 'OPS_STAFF' }))).toBe('FORBIDDEN');
    expect(await code(updateUser(principal(admin), admin.id, { isActive: false }))).toBe('FORBIDDEN'); // not yourself
    const second = await makeUser('SUPER_ADMIN');
    expect(await code(updateUser(principal(second), admin.id, { isActive: false }))).toBe('OK');
    expect(await code(updateUser(principal(second), second.id, { role: 'OPS_ADMIN' }))).toBe('FORBIDDEN');
  });
});

describe('rate limiter', () => {
  it('allows up to the limit then blocks, per key', async () => {
    const r: boolean[] = [];
    for (let i = 0; i < 4; i++) r.push(await rateLimit('t:a', 3, 60));
    expect(r).toEqual([true, true, true, false]);
    expect(await rateLimit('t:b', 3, 60)).toBe(true);
  });
  it('is correct under concurrency', async () => {
    const r = await Promise.all(Array.from({ length: 10 }, () => rateLimit('t:c', 4, 60)));
    expect(r.filter(Boolean)).toHaveLength(4);
  });
  it('starts a new window after it expires', async () => {
    await rateLimit('t:d', 1, 60);
    await db.rateLimit.update({ where: { key: 't:d' }, data: { windowStart: new Date(Date.now() - 120_000) } });
    expect(await rateLimit('t:d', 1, 60)).toBe(true);
  });
});

describe('job queue', () => {
  it('runs jobs once, retries failures with backoff, and dedupes', async () => {
    let calls = 0;
    registerJob('test_ok', async () => { calls++; });
    let flaky = 0;
    registerJob('test_flaky', async () => { if (++flaky < 2) throw new Error('boom'); });
    await enqueueJob('test_ok', {}, { dedupeKey: 'k1' });
    expect(await enqueueJob('test_ok', {}, { dedupeKey: 'k1' })).toBeNull();
    await enqueueJob('test_flaky', {});
    const first = await runDueJobs();
    expect(first).toEqual({ ran: 1, failed: 1 });
    expect(calls).toBe(1);
    const failed = await db.job.findFirstOrThrow({ where: { type: 'test_flaky' } });
    expect(failed.status).toBe('PENDING');
    expect(failed.runAt.getTime()).toBeGreaterThan(Date.now());
    await db.job.update({ where: { id: failed.id }, data: { runAt: new Date() } });
    expect((await runDueJobs()).ran).toBe(1);
    expect((await db.job.findUniqueOrThrow({ where: { id: failed.id } })).status).toBe('DONE');
  });

  it('gives up after the maximum attempts and records why', async () => {
    registerJob('test_dead', async () => { throw new Error('always'); });
    await enqueueJob('test_dead', {}, { maxAttempts: 1 });
    await runDueJobs();
    expect(await db.job.findFirstOrThrow({ where: { type: 'test_dead' } })).toMatchObject({ status: 'FAILED', lastError: 'always' });
  });

  it('lets two workers run at once without doing a job twice', async () => {
    let calls = 0;
    registerJob('test_once', async () => { calls++; await new Promise((r) => setTimeout(r, 50)); });
    for (let i = 0; i < 5; i++) await enqueueJob('test_once', { i });
    await Promise.all([runDueJobs(), runDueJobs(), runDueJobs()]);
    expect(calls).toBe(5);
  });
});

describe('outbox', () => {
  it('delivers through the job queue and marks messages skipped when no provider is configured', async () => {
    const s = await makeService();
    const r = await submitRequest(submission(s.id));
    await runDueJobs(50);
    const mails = await db.notificationEvent.findMany({ where: { requestId: r.id } });
    expect(mails.length).toBeGreaterThan(0);
    expect(mails.every((m) => m.status === 'SKIPPED')).toBe(true);
    expect(mails[0]!.error).toMatch(/No email provider/);
  });
});

describe('reports', () => {
  it('counts only what the viewer may see, flags small samples, and exports safe CSV', async () => {
    const s = await makeService();
    const ops = await makeUser('OPS_ADMIN');
    const staff = await makeUser('OPS_STAFF');
    const evil = await submitRequest(submission(s.id, { customer: { name: '=HYPERLINK("http://evil")', email: 'e@example.test', phone: '+234 800 000 0005', companyName: '+cmd|calc' } }));
    await submitRequest(submission(s.id, { customer: { name: 'Bola Ade', email: 'b@example.test', phone: '+234 800 000 0006' } }));
    const range = parseRange(undefined, undefined, 30);
    const all = await dashboard(principal(ops), range);
    expect(all.counts.total).toBe(2);
    expect(all.counts.newUnassigned).toBe(2);
    expect(all.quoteConversion.reliable).toBe(false);
    expect(await code(dashboard(principal(staff), range))).toBe('FORBIDDEN'); // assigned-only staff have no reports
    const commercial = await makeUser('COMMERCIAL');
    expect((await dashboard(principal(commercial), range)).counts.total).toBe(2);
    const csv = await requestsCsv(principal(ops), range);
    expect(csv).toContain(evil.reference);
    expect(csv).toContain(`"'=HYPERLINK`);
    expect(csv).toContain(`"'+cmd`);
    expect(await code(dashboard(principal(await makeUser('CUSTOMER')), range))).toBe('FORBIDDEN');
    await changeStatus(principal(ops), evil.id, 'UNDER_REVIEW');
    expect((await dashboard(principal(ops), range)).byStatus.map((x) => x.key).sort()).toEqual(['RECEIVED', 'UNDER_REVIEW']);
  });

  it('only shows a rate when enough cases stand behind it', () => {
    expect(pct(1, 2)).toMatchObject({ value: 50, reliable: false });
    expect(pct(3, MIN_SAMPLE)).toMatchObject({ value: 60, reliable: true });
    expect(pct(0, 0)).toMatchObject({ value: null, reliable: false });
  });

  it('ignores malformed date ranges', () => {
    const r = parseRange('garbage', '2026-02-30');
    expect(Number.isNaN(r.from.getTime())).toBe(false);
  });
});

describe('service configuration', () => {
  it('lets Operations Admin add a field that the request form then validates', async () => {
    const ops = await makeUser('OPS_ADMIN');
    const s = await makeService();
    await saveServiceField(principal(ops), s.id, null, { key: 'imo_number', label: 'IMO number', type: 'TEXT', required: true });
    expect(await code(submitRequest(submission(s.id)))).toBe('VALIDATION');
    expect(await code(submitRequest(submission(s.id, { details: { capacity: '1', product: 'x', imo_number: '9876543' } })))).toBe('OK');
    expect(await code(saveServiceField(principal(ops), s.id, null, { key: 'Bad Key', label: 'x', type: 'TEXT' }))).toBe('VALIDATION');
    expect(await code(saveServiceField(principal(ops), s.id, null, { key: 'imo_number', label: 'dup', type: 'TEXT' }))).toBe('CONFLICT');
    expect(await code(saveService(principal(await makeUser('COMMERCIAL')), null, {}))).toBe('FORBIDDEN');
  });
});

describe('integration secrets', () => {
  it('stores secrets encrypted, never returns them, and keeps them when the field is left blank', async () => {
    const admin = await makeUser('SUPER_ADMIN');
    await listIntegrations(principal(admin));
    const hook = await db.integration.findUniqueOrThrow({ where: { key: 'webhook' } });
    await saveIntegration(principal(admin), 'webhook', { enabled: false, values: { url: 'https://example.com/hook', secret: 'whsec_topsecret' } });
    const row = await db.integration.findUniqueOrThrow({ where: { id: hook.id } });
    expect(row.secretEnc).toBeTruthy();
    expect(row.secretEnc).not.toContain('topsecret');
    expect(JSON.stringify(row.config)).not.toContain('topsecret');
    await saveIntegration(principal(admin), 'webhook', { enabled: false, values: { url: 'https://example.com/hook', secret: '' } });
    const list = await listIntegrations(principal(admin));
    const w = list.find((i) => i.adapter.key === 'webhook')!;
    expect(w.secretsSet.secret).toBe(true);
    expect(JSON.stringify(w)).not.toContain('topsecret');
    expect(await code(listIntegrations(principal(await makeUser('OPS_ADMIN'))))).toBe('FORBIDDEN');
    void encryptJson;
  });

  it('refuses webhook targets that point inside the network', async () => {
    const admin = await makeUser('SUPER_ADMIN');
    await listIntegrations(principal(admin));
    for (const url of ['http://example.com/hook', 'https://localhost:5432/', 'https://127.0.0.1/', 'https://169.254.169.254/latest/meta-data', 'https://10.0.0.5/hook', 'https://[::1]/', 'https://[::ffff:10.0.0.1]/', 'https://user:pw@example.com/', 'file:///etc/passwd']) {
      expect(await code(saveIntegration(principal(admin), 'webhook', { enabled: true, values: { url, secret: 's' } })), url).toBe('VALIDATION');
    }
  });
});
