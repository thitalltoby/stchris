import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/server/db';
import { submitRequest, getCustomerRequest } from '@/server/requests';
import { createQuotation, saveRevision, submitForApproval, decideApproval, issueQuotation, reviseQuotation, withdrawQuotation, recordCustomerDecision, expireQuotations, getCustomerQuotation } from '@/server/quotations';
import { setSetting } from '@/server/settings';
import { AppError } from '@/server/errors';
import { resetDb, makeUser, makeService, principal, submission } from './helpers';

const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof AppError ? e.code : `ERR:${e}`));
const lines = [{ description: 'Bulk supply', unit: 'tonne-month', quantity: 2, unitPrice: 500000, discountPercent: 0, taxPercent: 7.5 }];

let commercial: Awaited<ReturnType<typeof makeUser>>;
let approver: Awaited<ReturnType<typeof makeUser>>;
let ops: Awaited<ReturnType<typeof makeUser>>;
let customer: Awaited<ReturnType<typeof makeUser>>;
let requestId: string;

beforeEach(async () => {
  await resetDb();
  commercial = await makeUser('COMMERCIAL');
  approver = await makeUser('APPROVER');
  ops = await makeUser('OPS_ADMIN');
  customer = await makeUser('CUSTOMER', { email: 'ada@example.test' });
  const s = await makeService();
  const r = await submitRequest(submission(s.id));
  requestId = r.id;
  await db.contact.updateMany({ where: { email: 'ada@example.test' }, data: { userId: customer.id } });
});

async function prepared() {
  const { quotationId, revisionId } = await createQuotation(principal(commercial), requestId);
  await saveRevision(principal(commercial), revisionId, { lines, validityDays: 14 });
  return { quotationId, revisionId };
}
async function issued() {
  const q = await prepared();
  await submitForApproval(principal(commercial), q.revisionId);
  await decideApproval(principal(approver), q.revisionId, 'APPROVED', 'ok');
  await issueQuotation(principal(commercial), q.revisionId);
  return q;
}
const reqStatus = async () => (await db.quoteRequest.findUniqueOrThrow({ where: { id: requestId } })).status;

describe('quotation lifecycle', () => {
  it('numbers quotations, computes totals on the server, and moves the request into preparation', async () => {
    const { quotationId, revisionId } = await prepared();
    const q = await db.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    expect(q.number).toMatch(/^QT-\d{4}-0001$/);
    const rev = await db.quotationRevision.findUniqueOrThrow({ where: { id: revisionId } });
    expect(rev.subtotal.toString()).toBe('1000000');
    expect(rev.taxTotal.toString()).toBe('75000');
    expect(rev.total.toString()).toBe('1075000');
    expect(await reqStatus()).toBe('QUOTATION_IN_PREPARATION');
  });

  it('ignores any total sent from the browser', async () => {
    const { revisionId } = await createQuotation(principal(commercial), requestId);
    await saveRevision(principal(commercial), revisionId, { lines, total: '1', subtotal: '1' } as never);
    expect((await db.quotationRevision.findUniqueOrThrow({ where: { id: revisionId } })).total.toString()).toBe('1075000');
  });

  it('runs draft → approval → issue → customer acceptance, with the request following', async () => {
    const q = await issued();
    expect(await reqStatus()).toBe('QUOTATION_ISSUED');
    const rev = await db.quotationRevision.findUniqueOrThrow({ where: { id: q.revisionId } });
    expect(rev.status).toBe('ISSUED');
    expect(rev.validUntil!.getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);

    await recordCustomerDecision(customer.id, q.quotationId, 'ACCEPTED', 'Go ahead', '203.0.113.9');
    expect(await reqStatus()).toBe('ACCEPTED');
    const d = await db.quotationDecision.findFirstOrThrow({ where: { quotationId: q.quotationId } });
    expect(d).toMatchObject({ decision: 'ACCEPTED', decidedByEmail: 'ada@example.test', ip: '203.0.113.9' });
    // answered once only
    expect(await code(recordCustomerDecision(customer.id, q.quotationId, 'DECLINED', 'changed my mind', null))).toBe('CONFLICT');
    expect(await db.quotationDecision.count()).toBe(1);
  });

  it('survives two simultaneous customer responses', async () => {
    const q = await issued();
    const results = await Promise.all([
      code(recordCustomerDecision(customer.id, q.quotationId, 'ACCEPTED', undefined, null)),
      code(recordCustomerDecision(customer.id, q.quotationId, 'ACCEPTED', undefined, null)),
    ]);
    expect(results.filter((r) => r === 'OK')).toHaveLength(1);
    expect(await db.quotationDecision.count()).toBe(1);
  });

  it('requires a reason to decline', async () => {
    const q = await issued();
    expect(await code(recordCustomerDecision(customer.id, q.quotationId, 'DECLINED', '  ', null))).toBe('VALIDATION');
    expect(await code(recordCustomerDecision(customer.id, q.quotationId, 'DECLINED', 'Too expensive', null))).toBe('OK');
    expect(await reqStatus()).toBe('DECLINED');
  });
});

describe('approval controls', () => {
  it('stops people approving their own work, even with the approval permission', async () => {
    const superAdmin = await makeUser('SUPER_ADMIN');
    const { quotationId, revisionId } = await createQuotation(principal(superAdmin), requestId);
    await saveRevision(principal(superAdmin), revisionId, { lines });
    await submitForApproval(principal(superAdmin), revisionId);
    expect(await code(decideApproval(principal(superAdmin), revisionId, 'APPROVED'))).toBe('FORBIDDEN');
    expect(await code(decideApproval(principal(approver), revisionId, 'APPROVED'))).toBe('OK');
    expect(quotationId).toBeTruthy();
  });

  it('stops the person who submitted a colleague’s draft from approving it', async () => {
    const superAdmin = await makeUser('SUPER_ADMIN');
    const { revisionId } = await prepared(); // prepared by commercial
    await submitForApproval(principal(superAdmin), revisionId); // submitted by super admin
    expect(await code(decideApproval(principal(superAdmin), revisionId, 'APPROVED'))).toBe('FORBIDDEN');
  });

  it('enforces an approver’s personal limit', async () => {
    const limited = await makeUser('APPROVER', { approvalLimit: '500000' });
    const { revisionId } = await prepared();
    await submitForApproval(principal(commercial), revisionId);
    expect(await code(decideApproval(principal(limited), revisionId, 'APPROVED'))).toBe('FORBIDDEN');
    expect(await code(decideApproval(principal(approver), revisionId, 'APPROVED'))).toBe('OK');
  });

  it('returns a rejected quotation to draft, and requires a reason', async () => {
    const { revisionId } = await prepared();
    await submitForApproval(principal(commercial), revisionId);
    expect(await code(decideApproval(principal(approver), revisionId, 'REJECTED'))).toBe('VALIDATION');
    await decideApproval(principal(approver), revisionId, 'REJECTED', 'Price too low');
    expect((await db.quotationRevision.findUniqueOrThrow({ where: { id: revisionId } })).status).toBe('DRAFT');
  });

  it('refuses to issue or edit what has not been approved or is no longer a draft', async () => {
    const { revisionId } = await prepared();
    expect(await code(issueQuotation(principal(commercial), revisionId))).toBe('CONFLICT');
    await submitForApproval(principal(commercial), revisionId);
    expect(await code(issueQuotation(principal(commercial), revisionId))).toBe('CONFLICT');
    expect(await code(saveRevision(principal(commercial), revisionId, { lines }))).toBe('CONFLICT');
  });

  it('refuses empty and zero-value quotations', async () => {
    const { revisionId } = await createQuotation(principal(commercial), requestId);
    expect(await code(submitForApproval(principal(commercial), revisionId))).toBe('VALIDATION');
    await saveRevision(principal(commercial), revisionId, { lines: [{ description: 'Free', unit: 'each', quantity: 1, unitPrice: 0 }] });
    expect(await code(submitForApproval(principal(commercial), revisionId))).toBe('VALIDATION');
  });

  it('honours the configured threshold: below it, approval is skipped but recorded', async () => {
    await setSetting('quotes', { currency: 'NGN', validityDays: 14, taxRates: [{ label: 'No tax', percent: 0 }], defaultTaxPercent: 0, paymentTerms: '', terms: '', introduction: '', requireApproval: true, approvalThreshold: 5_000_000, customerCanRespond: true });
    const { revisionId, quotationId } = await prepared();
    expect(await submitForApproval(principal(commercial), revisionId)).toBe(false);
    expect((await db.quotationRevision.findUniqueOrThrow({ where: { id: revisionId } })).status).toBe('APPROVED');
    expect((await db.quotationApproval.findMany({ where: { revisionId } })).map((a) => a.decision)).toEqual(['SUBMITTED', 'APPROVED']);
    expect(await db.auditEvent.count({ where: { action: 'quotation.auto_approved', entityId: quotationId } })).toBe(1);
  });

  it('keeps roles in their lanes', async () => {
    expect(await code(createQuotation(principal(approver), requestId))).toBe('FORBIDDEN');
    expect(await code(createQuotation(principal(ops), requestId))).toBe('FORBIDDEN');
    const { revisionId } = await prepared();
    await submitForApproval(principal(commercial), revisionId);
    expect(await code(decideApproval(principal(commercial), revisionId, 'APPROVED'))).toBe('FORBIDDEN');
    expect(await code(issueQuotation(principal(approver), revisionId))).toBe('FORBIDDEN');
  });
});

describe('revisions, withdrawal and expiry', () => {
  it('supersedes an issued revision when a new one is issued, and keeps history', async () => {
    const q = await issued();
    const v2 = await reviseQuotation(principal(commercial), q.quotationId);
    await saveRevision(principal(commercial), v2, { lines: [{ ...lines[0]!, unitPrice: 450000 }] });
    await submitForApproval(principal(commercial), v2);
    await decideApproval(principal(approver), v2, 'APPROVED');
    await issueQuotation(principal(commercial), v2);
    const revs = await db.quotationRevision.findMany({ where: { quotationId: q.quotationId }, orderBy: { version: 'asc' } });
    expect(revs.map((r) => [r.version, r.status])).toEqual([[1, 'SUPERSEDED'], [2, 'ISSUED']]);
    // the customer sees the newest version and can only answer that one
    const view = await getCustomerQuotation(customer.id, q.quotationId);
    expect(view.revisions[0]!.version).toBe(2);
  });

  it('withdraws an issued quotation so the customer can no longer accept it', async () => {
    const q = await issued();
    await withdrawQuotation(principal(commercial), q.quotationId, 'Scope changed');
    expect(await code(recordCustomerDecision(customer.id, q.quotationId, 'ACCEPTED', undefined, null))).not.toBe('OK');
  });

  it('expires lapsed quotations and the request with them', async () => {
    const q = await issued();
    await db.quotationRevision.update({ where: { id: q.revisionId }, data: { validUntil: new Date(Date.now() - 1000) } });
    expect(await code(recordCustomerDecision(customer.id, q.quotationId, 'ACCEPTED', undefined, null))).toBe('CONFLICT');
    expect(await expireQuotations()).toBe(1);
    expect(await reqStatus()).toBe('EXPIRED');
    expect(await expireQuotations()).toBe(0);
  });
});

describe('privacy between customers', () => {
  it('shows only issued-or-later revisions, and never to another customer', async () => {
    const { quotationId } = await prepared();
    expect(await code(getCustomerQuotation(customer.id, quotationId))).toBe('NOT_FOUND'); // still a draft
    const q = await issued();
    expect(await code(getCustomerQuotation(customer.id, q.quotationId))).toBe('OK');
    const stranger = await makeUser('CUSTOMER');
    expect(await code(getCustomerQuotation(stranger.id, q.quotationId))).toBe('NOT_FOUND');
    expect(await code(recordCustomerDecision(stranger.id, q.quotationId, 'ACCEPTED', undefined, null))).toBe('NOT_FOUND');
    const detail = await getCustomerRequest(customer.id, requestId);
    expect(JSON.stringify(detail)).not.toMatch(/internal note|approvalLimit|passwordHash/i);
  });
});
