import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '@/server/db';
import { submitRequest, changeStatus, assignRequest, requestMoreInfo, answerInfoRequest, listRequests, getRequestForStaff, getCustomerRequest, listCustomerRequests, verifyConfirmationToken, confirmationToken } from '@/server/requests';
import { registerCustomer, verifyEmailToken } from '@/server/auth';
import { AppError } from '@/server/errors';
import { resetDb, makeUser, makeService, principal, submission, pdfFile, PASSWORD } from './helpers';

let serviceId: string;
beforeAll(async () => { await resetDb(); });
beforeEach(async () => {
  await resetDb();
  serviceId = (await makeService()).id;
});

const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof AppError ? e.code : `ERR:${e}`));

describe('submitting a request', () => {
  it('creates a request with a unique reference, snapshots labels, and links a company and contact', async () => {
    const r = await submitRequest(submission(serviceId));
    expect(r.reference).toMatch(/^SCG-\d{4}-00001$/);
    const row = await db.quoteRequest.findUniqueOrThrow({ where: { id: r.id }, include: { history: true, company: true, contact: true } });
    expect(row.status).toBe('RECEIVED');
    expect(row.requesterEmail).toBe('ada@example.test');
    expect(row.history.map((h) => h.toStatus)).toEqual(['RECEIVED']);
    expect(row.company?.name).toBe('Ada Energy Ltd');
    expect(row.contact?.email).toBe('ada@example.test');
    expect(row.detailLabels).toMatchObject({ capacity: { label: 'Capacity required' } });
    const r2 = await submitRequest(submission(serviceId, { customer: { name: 'Bola Ade', email: 'b@example.test', phone: '+234 800 000 0002' } }));
    expect(r2.reference).toMatch(/00002$/);
  });

  it('is idempotent: the same key returns the original and creates nothing new', async () => {
    const body = submission(serviceId);
    const a = await submitRequest(body);
    const b = await submitRequest(body);
    expect(b).toMatchObject({ id: a.id, reference: a.reference, duplicate: true });
    expect(await db.quoteRequest.count()).toBe(1);
  });

  it('survives two simultaneous submissions with the same key', async () => {
    const body = submission(serviceId);
    const results = await Promise.allSettled([submitRequest(body), submitRequest(body)]);
    expect(await db.quoteRequest.count()).toBe(1);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
  });

  it('allocates distinct references under concurrency', async () => {
    const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => submitRequest(submission(serviceId, { customer: { name: 'Pat Doe', email: `p${i}@example.test`, phone: '+234 800 000 0003' } }))));
    expect(new Set(rs.map((r) => r.reference)).size).toBe(6);
  });

  it('validates on the server regardless of what the browser sent', async () => {
    expect(await code(submitRequest(submission(serviceId, { details: { product: 'x' } })))).toBe('VALIDATION');
    expect(await code(submitRequest(submission(serviceId, { details: { capacity: 'lots', product: 'x' } })))).toBe('VALIDATION');
    expect(await code(submitRequest(submission(serviceId, { consent: false })))).toBe('VALIDATION');
    expect(await code(submitRequest(submission(serviceId, { website: 'spam' })))).toBe('VALIDATION');
    expect(await code(submitRequest(submission('no-such-service')))).toBe('VALIDATION');
    expect(await db.quoteRequest.count()).toBe(0);
  });

  it('does not accept hidden services', async () => {
    await db.service.update({ where: { id: serviceId }, data: { visible: false } });
    expect(await code(submitRequest(submission(serviceId)))).toBe('VALIDATION');
  });

  it('stores accepted uploads privately and rejects bad ones without creating a request', async () => {
    const ok = await submitRequest(submission(serviceId), { files: [pdfFile()] });
    const docs = await db.document.findMany({ where: { requestId: ok.id } });
    expect(docs).toHaveLength(1);
    expect(docs[0]!.visibility).toBe('CUSTOMER');
    const before = await db.quoteRequest.count();
    const bad = new File([Buffer.from('MZ')], 'tool.exe');
    expect(await code(submitRequest(submission(serviceId), { files: [bad] }))).toBe('VALIDATION');
    expect(await db.quoteRequest.count()).toBe(before);
  });

  it('rate-limits repeated submissions from one address', async () => {
    const out: string[] = [];
    for (let i = 0; i < 9; i++) out.push(await code(submitRequest(submission(serviceId, { customer: { name: 'Rita Doe', email: `r${i}@example.test`, phone: '+234 800 000 0004' } }))));
    expect(out.slice(0, 8)).toEqual(Array(8).fill('OK'));
    expect(out[8]).toBe('RATE_LIMITED');
  });

  it('queues an acknowledgement for the customer', async () => {
    const r = await submitRequest(submission(serviceId));
    const mails = await db.notificationEvent.findMany({ where: { requestId: r.id } });
    expect(mails.some((m) => m.toAddress === 'ada@example.test' && m.type === 'request.confirmation')).toBe(true);
  });

  it('confirmation links need the matching token', () => {
    const t = confirmationToken('SCG-2026-00001');
    expect(verifyConfirmationToken('SCG-2026-00001', t)).toBe(true);
    expect(verifyConfirmationToken('SCG-2026-00002', t)).toBe(false);
    expect(verifyConfirmationToken('SCG-2026-00001', 'x')).toBe(false);
  });
});

describe('who can see which request', () => {
  it('limits operations staff to assigned requests and customers to their own', async () => {
    const opsAdmin = await makeUser('OPS_ADMIN');
    const staff = await makeUser('OPS_STAFF');
    const other = await makeUser('OPS_STAFF');
    const a = await submitRequest(submission(serviceId));
    await submitRequest(submission(serviceId, { customer: { name: 'Bola Ade', email: 'b@example.test', phone: '+234 800 000 0002' } }));
    await assignRequest(principal(opsAdmin), a.id, staff.id);

    expect((await listRequests(principal(opsAdmin), {})).total).toBe(2);
    expect((await listRequests(principal(staff), {})).total).toBe(1);
    expect((await listRequests(principal(other), {})).total).toBe(0);
    expect(await code(getRequestForStaff(principal(other), a.id))).toBe('NOT_FOUND');
    expect(await code(getRequestForStaff(principal(staff), a.id))).toBe('OK');
  });

  it('links earlier guest requests to an account once the email is verified, and to nobody else', async () => {
    const a = await submitRequest(submission(serviceId));
    const { userId } = await registerCustomer({ name: 'Ada Okafor', email: 'ada@example.test', password: PASSWORD, companyName: 'Ada Energy Ltd' });
    // before verification, nothing is attached to the account
    expect(await listCustomerRequests(userId)).toHaveLength(0);
    const tok = await db.authToken.findFirstOrThrow({ where: { userId, purpose: 'EMAIL_VERIFY' } });
    expect(tok).toBeTruthy();
    // the raw token only exists in the outbox email; fish it out as a real customer would
    const mail = await db.notificationEvent.findFirstOrThrow({ where: { toAddress: 'ada@example.test', type: 'auth.verify_email' } });
    const raw = /token=([\w-]+)/.exec(mail.body)![1]!;
    expect(await verifyEmailToken(raw)).toBe(true);
    expect(await verifyEmailToken(raw)).toBe(false); // single use
    expect((await listCustomerRequests(userId)).map((r) => r.id)).toEqual([a.id]);

    const stranger = await makeUser('CUSTOMER');
    expect(await listCustomerRequests(stranger.id)).toHaveLength(0);
    expect(await code(getCustomerRequest(stranger.id, a.id))).toBe('NOT_FOUND');
  });
});

describe('status changes', () => {
  it('follows the allowed transitions, records history, and demands a reason where required', async () => {
    const ops = await makeUser('OPS_ADMIN');
    const r = await submitRequest(submission(serviceId));
    expect(await code(changeStatus(principal(ops), r.id, 'COMPLETED'))).toBe('CONFLICT');
    expect(await code(changeStatus(principal(ops), r.id, 'DECLINED'))).toBe('VALIDATION');
    expect(await code(changeStatus(principal(ops), r.id, 'DECLINED', 'Outside our service area'))).toBe('OK');
    const hist = await db.statusHistory.findMany({ where: { requestId: r.id }, orderBy: { createdAt: 'asc' } });
    expect(hist.map((h) => h.toStatus)).toEqual(['RECEIVED', 'DECLINED']);
    expect(hist[1]!.note).toBe('Outside our service area');
  });

  it('keeps quotation-driven statuses out of the manual menu', async () => {
    const ops = await makeUser('OPS_ADMIN');
    const r = await submitRequest(submission(serviceId));
    await changeStatus(principal(ops), r.id, 'UNDER_REVIEW');
    expect(await code(changeStatus(principal(ops), r.id, 'QUOTATION_ISSUED'))).not.toBe('OK');
    expect(await code(changeStatus(principal(ops), r.id, 'ACCEPTED'))).not.toBe('OK');
  });

  it('forbids roles without the permission', async () => {
    const approver = await makeUser('APPROVER');
    const r = await submitRequest(submission(serviceId));
    expect(await code(changeStatus(principal(approver), r.id, 'UNDER_REVIEW'))).toBe('FORBIDDEN');
    expect(await code(assignRequest(principal(approver), r.id, approver.id))).toBe('FORBIDDEN');
  });
});

describe('information requests', () => {
  it('moves the request to "more information", and back to review when the customer answers', async () => {
    const ops = await makeUser('OPS_ADMIN');
    const { userId } = await registerCustomer({ name: 'Ada Okafor', email: 'ada@example.test', password: PASSWORD, companyName: 'Ada Energy Ltd' });
    await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    await db.contact.updateMany({ where: { email: 'ada@example.test' }, data: { userId } });
    const r = await submitRequest(submission(serviceId));
    await requestMoreInfo(principal(ops), r.id, 'What is the loading window?');
    expect((await db.quoteRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('MORE_INFO_REQUIRED');
    const info = await db.infoRequest.findFirstOrThrow({ where: { requestId: r.id } });

    const stranger = await makeUser('CUSTOMER');
    expect(await code(answerInfoRequest(stranger.id, info.id, 'I am not the customer'))).toBe('NOT_FOUND');
    await answerInfoRequest(userId, info.id, 'Second week of next month.');
    expect((await db.quoteRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('UNDER_REVIEW');
    expect(await code(answerInfoRequest(userId, info.id, 'Answering twice'))).toBe('CONFLICT');
  });
});
