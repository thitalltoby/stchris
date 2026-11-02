import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/server/db';
import { submitRequest } from '@/server/requests';
import { createQuotation, saveRevision, submitForApproval, decideApproval, issueQuotation, recordOfflineResponse, recordCustomerDecision } from '@/server/quotations';
import { AppError } from '@/server/errors';
import { resetDb, makeUser, makeService, principal, submission } from './helpers';

const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof AppError ? e.code : `ERR:${e}`));
const lines = [{ description: 'Bulk supply', unit: 'tonne-month', quantity: 2, unitPrice: 500000, discountPercent: 0, taxPercent: 0 }];

let commercial: Awaited<ReturnType<typeof makeUser>>, approver: Awaited<ReturnType<typeof makeUser>>, ops: Awaited<ReturnType<typeof makeUser>>, customer: Awaited<ReturnType<typeof makeUser>>;
let requestId: string;

beforeEach(async () => {
  await resetDb();
  commercial = await makeUser('COMMERCIAL');
  approver = await makeUser('APPROVER');
  ops = await makeUser('OPS_ADMIN');
  customer = await makeUser('CUSTOMER', { email: 'ada@example.test' });
  requestId = (await submitRequest(submission((await makeService()).id))).id;
  await db.contact.updateMany({ where: { email: 'ada@example.test' }, data: { userId: customer.id } });
});

async function issued() {
  const { quotationId, revisionId } = await createQuotation(principal(commercial), requestId);
  await saveRevision(principal(commercial), revisionId, { lines, validityDays: 14 });
  await submitForApproval(principal(commercial), revisionId);
  await decideApproval(principal(approver), revisionId, 'APPROVED', 'ok');
  await issueQuotation(principal(commercial), revisionId);
  // pretend it was issued two days ago so earlier phone answers are plausible
  await db.quotationRevision.update({ where: { id: revisionId }, data: { issuedAt: new Date(Date.now() - 2 * 86_400_000), validUntil: new Date(Date.now() + 12 * 86_400_000) } });
  return { quotationId, revisionId };
}
const valid = (over: Record<string, unknown> = {}) => ({
  decision: 'ACCEPTED', channel: 'PHONE', respondentName: 'Ada Okafor', respondentEmail: 'ada@example.test',
  occurredAt: new Date(Date.now() - 3_600_000).toISOString(), reference: 'PO-7781', note: 'Ada confirmed by phone and will send the PO.', ...over,
});
const evidence = { storageKey: '2026/10/x.bin', originalName: 'signed.pdf', mimeType: 'application/pdf', sizeBytes: 10, sha256: 'a'.repeat(64), scanStatus: 'CLEAN' as const, scanEngine: 'builtin', scanDetail: 'ok', scannedAt: new Date() };

describe('offline acceptance by staff', () => {
  it('records an acceptance with its channel, recorder and real time, and moves the request on', async () => {
    const { quotationId, revisionId } = await issued();
    const when = new Date(Date.now() - 7_200_000);
    await recordOfflineResponse(principal(commercial), quotationId, valid({ occurredAt: when.toISOString() }));
    const rev = await db.quotationRevision.findUniqueOrThrow({ where: { id: revisionId } });
    expect(rev.status).toBe('ACCEPTED');
    expect((await db.quotation.findUniqueOrThrow({ where: { id: quotationId } })).status).toBe('ACCEPTED');
    expect((await db.quoteRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe('ACCEPTED');
    const d = await db.quotationDecision.findFirstOrThrow({ where: { quotationId } });
    expect(d).toMatchObject({ decision: 'ACCEPTED', channel: 'PHONE', userId: null, recordedById: commercial.id, recordedByName: commercial.name, reference: 'PO-7781', decidedByName: 'Ada Okafor' });
    expect(d.occurredAt?.getTime()).toBe(when.getTime());
    expect(await db.auditEvent.count({ where: { action: 'quotation.offline_accepted', entityId: quotationId } })).toBe(1);
    // the customer is told, and the integration event carries the channel
    expect(await db.notificationEvent.count({ where: { toAddress: 'ada@example.test', type: 'quotation.customer_receipt' } })).toBe(1);
  });

  it('stores evidence on the request, internal only', async () => {
    const { quotationId } = await issued();
    await recordOfflineResponse(principal(commercial), quotationId, valid({ reference: '' }), evidence);
    const d = await db.quotationDecision.findFirstOrThrow({ where: { quotationId } });
    const doc = await db.document.findUniqueOrThrow({ where: { id: d.evidenceDocumentId! } });
    expect(doc).toMatchObject({ visibility: 'INTERNAL', requestId, quotationId });
  });

  it('records a decline with a reason', async () => {
    const { quotationId } = await issued();
    await recordOfflineResponse(principal(commercial), quotationId, valid({ decision: 'DECLINED', reference: '', note: 'Customer found a cheaper offer.' }));
    expect((await db.quoteRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe('DECLINED');
  });

  it('needs a reference or evidence for an acceptance', async () => {
    const { quotationId } = await issued();
    expect(await code(recordOfflineResponse(principal(commercial), quotationId, valid({ reference: '' })))).toBe('VALIDATION');
  });

  it('refuses impossible dates, other channels, and weak records', async () => {
    const { quotationId } = await issued();
    const p = principal(commercial);
    expect(await code(recordOfflineResponse(p, quotationId, valid({ occurredAt: new Date(Date.now() + 86_400_000).toISOString() })))).toBe('VALIDATION');
    expect(await code(recordOfflineResponse(p, quotationId, valid({ occurredAt: new Date(Date.now() - 5 * 86_400_000).toISOString() })))).toBe('VALIDATION'); // before it was issued
    expect(await code(recordOfflineResponse(p, quotationId, valid({ channel: 'TELEPATHY' })))).toBe('VALIDATION');
    expect(await code(recordOfflineResponse(p, quotationId, valid({ note: 'ok' })))).toBe('VALIDATION');
    expect(await code(recordOfflineResponse(p, quotationId, valid({ respondentName: '' })))).toBe('VALIDATION');
    expect((await db.quoteRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe('QUOTATION_ISSUED');
  });

  it('is limited to people with the permission', async () => {
    const { quotationId } = await issued();
    for (const u of [ops, approver, customer]) expect(await code(recordOfflineResponse(principal(u), quotationId, valid()))).toBe('FORBIDDEN');
  });

  it('cannot answer a quotation twice, from either side', async () => {
    const { quotationId } = await issued();
    await recordOfflineResponse(principal(commercial), quotationId, valid());
    expect(await code(recordOfflineResponse(principal(commercial), quotationId, valid()))).toBe('CONFLICT');
    expect(await code(recordCustomerDecision(customer.id, quotationId, 'DECLINED', 'changed my mind', null))).toBe('CONFLICT');
  });

  it('does not work on a draft', async () => {
    const { quotationId } = await createQuotation(principal(commercial), requestId);
    expect(await code(recordOfflineResponse(principal(commercial), quotationId, valid()))).toBe('CONFLICT');
  });

  it('rejects an acceptance dated after the quotation expired', async () => {
    const { quotationId, revisionId } = await issued();
    await db.quotationRevision.update({ where: { id: revisionId }, data: { validUntil: new Date(Date.now() - 3 * 3_600_000) } });
    expect(await code(recordOfflineResponse(principal(commercial), quotationId, valid()))).toBe('VALIDATION');
  });
});
