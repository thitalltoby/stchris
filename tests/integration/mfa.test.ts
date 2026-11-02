import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/server/db';
import { beginEnrollment, confirmEnrollment, verifySecondFactor, regenerateRecoveryCodes, disableOwnMfa, adminResetMfa, getMfaStatus, totpCode, totpStep, startChallenge, completeChallenge, currentChallenge } from '@/server/mfa';
import { setSetting } from '@/server/settings';
import { requireStaff } from '@/server/rbac';
import { createSession } from '@/server/session';
import { AppError } from '@/server/errors';
import { __jar } from '../next-headers-stub';
import { resetDb, makeUser, principal, PASSWORD } from './helpers';

const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof AppError ? e.code : `ERR:${e}`));
const nowCode = (secret: string, offset = 0) => totpCode(secret, totpStep() + offset);

async function enrol(userId: string) {
  const { secret } = await beginEnrollment(userId);
  const codes = await confirmEnrollment(userId, nowCode(secret));
  return { secret, codes };
}

beforeEach(async () => {
  await resetDb();
  __jar.clear();
});

describe('enrolment', () => {
  it('is off until the first code is confirmed, then gives ten one-time recovery codes', async () => {
    const u = await makeUser('COMMERCIAL');
    const { secret, url, qrSvg } = await beginEnrollment(u.id);
    expect(url).toContain(secret);
    expect(qrSvg).toContain('<svg');
    expect(await getMfaStatus(u.id)).toMatchObject({ enabled: false, pending: true });
    expect(await code(confirmEnrollment(u.id, '000000'))).toBe('VALIDATION');
    const codes = await confirmEnrollment(u.id, nowCode(secret));
    expect(codes).toHaveLength(10);
    expect(await getMfaStatus(u.id)).toMatchObject({ enabled: true, recoveryCodesLeft: 10 });
    // codes are stored hashed
    const stored = await db.mfaRecoveryCode.findMany({ where: { userId: u.id } });
    expect(stored.some((r) => codes.some((c) => r.codeHash.includes(c)))).toBe(false);
    // the secret is stored encrypted
    const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.mfaSecretEnc).not.toContain(secret);
  });

  it('is for staff only', async () => {
    const c = await makeUser('CUSTOMER');
    expect(await code(beginEnrollment(c.id))).toBe('FORBIDDEN');
  });
});

describe('verifying a second factor', () => {
  it('accepts each code once (replay is refused) and tolerates one step of clock drift', async () => {
    const u = await makeUser('OPS_ADMIN');
    const { secret } = await enrol(u.id);
    // the enrolment code consumed the current step, so the next valid one is a later step
    const next = nowCode(secret, 1);
    expect(await verifySecondFactor(u.id, next, { allowRecovery: false })).toBe('totp');
    expect(await code(verifySecondFactor(u.id, next, { allowRecovery: false }))).toBe('VALIDATION');
    // an older step than the last accepted one never works
    expect(await code(verifySecondFactor(u.id, nowCode(secret, -1), { allowRecovery: false }))).toBe('VALIDATION');
  });

  it('refuses a wrong code and a code for someone else', async () => {
    const a = await makeUser('OPS_ADMIN');
    const b = await makeUser('COMMERCIAL');
    const ea = await enrol(a.id);
    await enrol(b.id);
    expect(await code(verifySecondFactor(a.id, '123456', { allowRecovery: true }))).toBe('VALIDATION');
    expect(await code(verifySecondFactor(b.id, nowCode(ea.secret, 1), { allowRecovery: true }))).toBe('VALIDATION');
  });

  it('accepts a recovery code once, in any case and with or without the dash', async () => {
    const u = await makeUser('COMMERCIAL');
    const { codes } = await enrol(u.id);
    expect(await verifySecondFactor(u.id, codes[0]!.toUpperCase().replace('-', ' '), { allowRecovery: true })).toBe('recovery');
    expect(await code(verifySecondFactor(u.id, codes[0]!, { allowRecovery: true }))).toBe('VALIDATION');
    expect((await getMfaStatus(u.id)).recoveryCodesLeft).toBe(9);
    // recovery codes are not accepted where only a live code is allowed
    expect(await code(verifySecondFactor(u.id, codes[1]!, { allowRecovery: false }))).toBe('VALIDATION');
  });

  it('rate-limits repeated guessing', async () => {
    const u = await makeUser('COMMERCIAL');
    await enrol(u.id);
    const results: string[] = [];
    for (let i = 0; i < 12; i++) results.push(await code(verifySecondFactor(u.id, '111111', { allowRecovery: false })));
    expect(results).toContain('RATE_LIMITED');
  });
});

describe('sign-in challenge', () => {
  it('is not a session, expires its attempts, and completes with a valid code', async () => {
    const u = await makeUser('COMMERCIAL');
    const { secret } = await enrol(u.id);
    await startChallenge(u.id, '/admin/requests');
    expect((await currentChallenge())?.userId).toBe(u.id);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    expect(await code(completeChallenge('000000'))).toBe('VALIDATION');
    const r = await completeChallenge(nowCode(secret, 1));
    expect(r).toMatchObject({ userId: u.id, next: '/admin/requests' });
    expect(await currentChallenge()).toBeNull(); // single use
  });

  it('is destroyed after five wrong codes even if the sixth would be right', async () => {
    const u = await makeUser('COMMERCIAL');
    const { secret } = await enrol(u.id);
    await startChallenge(u.id, null);
    for (let i = 0; i < 5; i++) expect(await code(completeChallenge('000000'))).toBe('VALIDATION');
    expect(await code(completeChallenge(nowCode(secret, 1)))).toBe('VALIDATION');
    expect(await currentChallenge()).toBeNull();
  });
});

describe('policy', () => {
  it('lets staff turn it off only when it is not required, and only with password and a code', async () => {
    const u = await makeUser('COMMERCIAL');
    const { secret } = await enrol(u.id);
    expect(await code(disableOwnMfa(u.id, 'wrong-password-1', nowCode(secret, 1)))).toBe('VALIDATION');
    await setSetting('security', { requireStaffMfa: true });
    expect(await code(disableOwnMfa(u.id, PASSWORD, nowCode(secret, 1)))).toBe('FORBIDDEN');
    await setSetting('security', { requireStaffMfa: false });
    expect(await code(disableOwnMfa(u.id, PASSWORD, nowCode(secret, 1)))).toBe('OK');
    expect(await getMfaStatus(u.id)).toMatchObject({ enabled: false, pending: false });
  });

  it('sends unenrolled staff to the set-up page when it is required', async () => {
    const u = await makeUser('OPS_ADMIN');
    await createSession({ id: u.id, role: u.role });
    await setSetting('security', { requireStaffMfa: true });
    await expect(requireStaff()).rejects.toThrow(/NEXT_REDIRECT|redirect/i);
    await expect(requireStaff(undefined, { allowUnenrolled: true })).resolves.toMatchObject({ id: u.id });
    await enrol(u.id);
    // a new session sees the enrolment
    __jar.clear();
    await createSession({ id: u.id, role: u.role });
    await expect(requireStaff()).resolves.toMatchObject({ id: u.id });
  });

  it('lets a Super Admin reset a colleague, ending their sessions; others cannot', async () => {
    const admin = await makeUser('SUPER_ADMIN');
    const staff = await makeUser('COMMERCIAL');
    const other = await makeUser('OPS_ADMIN');
    await enrol(staff.id);
    await db.session.create({ data: { tokenHash: 'x', userId: staff.id, expiresAt: new Date(Date.now() + 1e6) } });
    expect(await code(adminResetMfa(principal(other), staff.id))).toBe('FORBIDDEN');
    await adminResetMfa(principal(admin), staff.id);
    expect(await getMfaStatus(staff.id)).toMatchObject({ enabled: false, pending: false, recoveryCodesLeft: 0 });
    expect(await db.session.count({ where: { userId: staff.id } })).toBe(0);
    expect(await db.auditEvent.count({ where: { action: 'mfa.reset_by_admin' } })).toBe(1);
  });

  it('replaces recovery codes only with a live code', async () => {
    const u = await makeUser('COMMERCIAL');
    const { secret, codes } = await enrol(u.id);
    expect(await code(regenerateRecoveryCodes(u.id, codes[0]!))).toBe('VALIDATION');
    const fresh = await regenerateRecoveryCodes(u.id, nowCode(secret, 1));
    expect(fresh).toHaveLength(10);
    expect(await code(verifySecondFactor(u.id, codes[2]!, { allowRecovery: true }))).toBe('VALIDATION');
    expect(await verifySecondFactor(u.id, fresh[0]!, { allowRecovery: true })).toBe('recovery');
  });
});
