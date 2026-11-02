import 'server-only';
import { z } from 'zod';
import Decimal from 'decimal.js';
import type { Prisma } from '@/generated/prisma/client';
import type { QuotationStatus } from '@/generated/prisma/enums';
import { db, type Tx } from './db';
import { env } from './env';
import { audit } from './audit';
import { conflict, forbidden, invalid, notFound } from './errors';
import { assertCan, customerRequestScope, staffRequestScope, type Principal } from './rbac';
import { applyStatus, afterStatusChange } from './requests';
import { emitEvent } from './integrations/events';
import { enqueueEmail, notifyInternal } from './notify';
import { emailTemplate } from './email-templates';
import { getSetting } from './settings';
import { computeQuote, formatMoney } from '@/lib/money';
import { canTransition, STATUS_LABELS } from '@/lib/workflow';
import { can } from '@/lib/permissions';
import { QUOTATION_STATUS_LABELS } from '@/lib/quotation-labels';

export { QUOTATION_STATUS_LABELS };

export const LIVE_STATUSES: QuotationStatus[] = ['ISSUED', 'VIEWED'];
export const CUSTOMER_VISIBLE: QuotationStatus[] = ['ISSUED', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN', 'SUPERSEDED'];

const lineSchema = z.object({
  description: z.string().trim().min(1, 'Describe the line.').max(500),
  unit: z.string().trim().max(24).default('each'),
  quantity: z.coerce.number().positive('Quantity must be more than zero.').max(1e9),
  unitPrice: z.coerce.number().min(0, 'Price cannot be negative.').max(1e13),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  /** Set when the line came from the catalogue, so reports can group by product and SKU */
  productId: z.string().max(40).nullish(),
  variantId: z.string().max(40).nullish(),
  sku: z.string().max(60).nullish(),
});

export const revisionSchema = z.object({
  title: z.string().trim().max(200).optional().default(''),
  introduction: z.string().trim().max(4000).optional().default(''),
  terms: z.string().trim().max(8000).optional().default(''),
  paymentTerms: z.string().trim().max(2000).optional().default(''),
  currency: z.string().trim().length(3).toUpperCase().default('NGN'),
  validityDays: z.coerce.number().int().min(1).max(365).default(14),
  lines: z.array(lineSchema).max(60),
});
export type RevisionInput = z.input<typeof revisionSchema>;

async function nextNumber(tx: Tx): Promise<string> {
  const year = new Date().getUTCFullYear();
  const key = `quotation:${year}`;
  const c = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return `QT-${year}-${String(c.value).padStart(4, '0')}`;
}

async function loadRevision(user: Principal, revisionId: string) {
  const rev = await db.quotationRevision.findFirst({
    where: { id: revisionId, quotation: { request: staffRequestScope(user) } },
    include: { quotation: { include: { request: true } }, lineItems: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!rev) throw notFound('Quotation not found.');
  return rev;
}

/** Refresh the quotation header status from its newest revision. */
async function syncQuotationStatus(tx: Tx, quotationId: string) {
  const latest = await tx.quotationRevision.findFirst({ where: { quotationId }, orderBy: { version: 'desc' } });
  if (latest) await tx.quotation.update({ where: { id: quotationId }, data: { status: latest.status } });
}

// ─── Creating and editing ──────────────────────────────────────────

export async function createQuotation(user: Principal, requestId: string): Promise<{ quotationId: string; revisionId: string }> {
  assertCan(user, 'quotation.create');
  const req = await db.quoteRequest.findFirst({ where: { AND: [{ id: requestId }, staffRequestScope(user)] } });
  if (!req) throw notFound('Request not found.');
  if (['COMPLETED', 'DECLINED', 'CANCELLED', 'CLOSED', 'EXPIRED'].includes(req.status)) throw conflict('This request is closed. Reopen it before quoting.');
  const s = await getSetting('quotes');
  const actor = { id: user.id, label: user.name };
  const out = await db.$transaction(async (tx) => {
    const q = await tx.quotation.create({
      data: { number: await nextNumber(tx), requestId, companyId: req.companyId, contactId: req.contactId, createdById: user.id },
    });
    // Lines come from what the customer asked for. Prices are suggestions from the internal price book (blank = 0)
    // and always need a person's check before the quotation is issued.
    const asked = await tx.quoteRequestItem.findMany({ where: { requestId }, orderBy: { sortOrder: 'asc' } });
    const variants = asked.some((a) => a.variantId) ? await tx.productVariant.findMany({ where: { id: { in: asked.map((a) => a.variantId).filter((x): x is string => !!x) } }, select: { id: true, price: true } }) : [];
    const prefill = computeQuote(asked.map((a) => ({
      description: a.label,
      unit: a.unit,
      quantity: a.quantity.toString(),
      unitPrice: variants.find((v) => v.id === a.variantId)?.price?.toString() ?? '0',
      discountPercent: 0,
      taxPercent: s.defaultTaxPercent,
    })));
    const rev = await tx.quotationRevision.create({
      data: {
        quotationId: q.id,
        version: 1,
        ...(asked.length ? { subtotal: prefill.subtotal, discountTotal: prefill.discountTotal, taxTotal: prefill.taxTotal, total: prefill.total } : {}),
        lineItems: { create: asked.map((a, i) => ({ sortOrder: i, productId: a.productId, variantId: a.variantId, sku: a.sku, description: a.label, unit: a.unit, quantity: a.quantity, unitPrice: prefill.lines[i]!.unitPrice, discountPercent: '0', taxPercent: String(s.defaultTaxPercent), lineNet: prefill.lines[i]!.lineNet, lineTax: prefill.lines[i]!.lineTax })) },
        currency: s.currency,
        validityDays: s.validityDays,
        introduction: s.introduction,
        terms: s.terms,
        paymentTerms: s.paymentTerms,
        title: `Quotation for ${req.summary ?? 'your requirement'}`.slice(0, 200),
        createdById: user.id,
        createdByLabel: user.name,
      },
    });
    // Move the request into "Quotation in preparation", stepping through "Under review" if it is still new
    let status = req.status;
    if (status === 'RECEIVED') {
      await applyStatus(tx, requestId, 'UNDER_REVIEW', actor, { note: 'Review started when a quotation was created.' });
      status = 'UNDER_REVIEW';
    }
    if (status !== 'QUOTATION_IN_PREPARATION' && canTransition(status, 'QUOTATION_IN_PREPARATION')) {
      await applyStatus(tx, requestId, 'QUOTATION_IN_PREPARATION', actor, { note: `Quotation ${q.number} created.` });
    }
    await audit(actor, 'quotation.created', 'Quotation', q.id, { number: q.number, requestId }, null, tx);
    return { quotationId: q.id, revisionId: rev.id };
  });
  return out;
}

export async function saveRevision(user: Principal, revisionId: string, raw: RevisionInput) {
  assertCan(user, 'quotation.create');
  const rev = await loadRevision(user, revisionId);
  if (rev.status !== 'DRAFT') throw conflict('Only a draft can be edited. Create a new revision to change an issued quotation.');
  const parsed = revisionSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[i.path.join('.')] = i.message;
    throw invalid('Please check the quotation details.', fields);
  }
  const d = parsed.data;
  const totals = computeQuote(d.lines);
  await db.$transaction(async (tx) => {
    await tx.quotationLineItem.deleteMany({ where: { revisionId } });
    if (totals.lines.length) {
      await tx.quotationLineItem.createMany({
        data: totals.lines.map((l, i) => ({
          revisionId,
          sortOrder: i,
          productId: d.lines[i]?.productId || null,
          variantId: d.lines[i]?.variantId || null,
          sku: d.lines[i]?.sku || null,
          description: l.description,
          unit: l.unit || 'each',
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          discountPercent: String(l.discountPercent ?? 0),
          taxPercent: String(l.taxPercent ?? 0),
          lineNet: l.lineNet,
          lineTax: l.lineTax,
        })),
      });
    }
    await tx.quotationRevision.update({
      where: { id: revisionId },
      data: {
        title: d.title || null,
        introduction: d.introduction || null,
        terms: d.terms || null,
        paymentTerms: d.paymentTerms || null,
        currency: d.currency,
        validityDays: d.validityDays,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
      },
    });
    await audit({ id: user.id, label: user.name }, 'quotation.saved', 'Quotation', rev.quotationId, { version: rev.version, total: totals.total }, null, tx);
  });
  return totals;
}

// ─── Approval ──────────────────────────────────────────────────────

export async function submitForApproval(user: Principal, revisionId: string) {
  assertCan(user, 'quotation.submit');
  const rev = await loadRevision(user, revisionId);
  if (rev.status !== 'DRAFT') throw conflict('This revision is not a draft.');
  if (rev.lineItems.length === 0) throw invalid('Add at least one line item before submitting.');
  const total = new Decimal(rev.total.toString());
  if (total.lte(0)) throw invalid('The quotation total must be more than zero.');
  const s = await getSetting('quotes');
  const needs = s.requireApproval && total.gte(s.approvalThreshold);
  const actor = { id: user.id, label: user.name };
  await db.$transaction(async (tx) => {
    await tx.quotationApproval.create({ data: { revisionId, decision: 'SUBMITTED', actorId: user.id, actorLabel: user.name } });
    if (needs) {
      await tx.quotationRevision.update({ where: { id: revisionId }, data: { status: 'PENDING_APPROVAL', submittedAt: new Date() } });
    } else {
      // Policy (Settings → Quotations) says this total needs no approval. Recorded and audited, never silent.
      await tx.quotationRevision.update({ where: { id: revisionId }, data: { status: 'APPROVED', submittedAt: new Date(), approvedAt: new Date() } });
      await tx.quotationApproval.create({ data: { revisionId, decision: 'APPROVED', actorLabel: 'Policy', comment: `Approval not required below the configured threshold (${formatMoney(s.approvalThreshold, rev.currency)}).` } });
    }
    await syncQuotationStatus(tx, rev.quotationId);
    await audit(actor, needs ? 'quotation.submitted' : 'quotation.auto_approved', 'Quotation', rev.quotationId, { version: rev.version }, null, tx);
  });
  if (needs) {
    await notifyInternal(
      'approvalTo',
      `Quotation ${rev.quotation.number} awaits approval`,
      'A quotation needs your approval',
      [`${user.name} submitted quotation ${rev.quotation.number} (version ${rev.version}).`],
      `/admin/quotations/${rev.quotationId}`,
      [
        ['Request', rev.quotation.request.reference],
        ['Total', formatMoney(rev.total.toString(), rev.currency)],
      ],
      rev.quotation.requestId,
    );
  }
  return needs;
}

export async function decideApproval(user: Principal, revisionId: string, decision: 'APPROVED' | 'REJECTED', comment?: string) {
  assertCan(user, 'quotation.approve');
  const rev = await loadRevision(user, revisionId);
  if (rev.status !== 'PENDING_APPROVAL') throw conflict('This quotation is not awaiting approval.');
  if (rev.createdById === user.id) throw forbidden('You cannot approve a quotation you prepared yourself. Another approver must review it.');
  const submitter = await db.quotationApproval.findFirst({ where: { revisionId, decision: 'SUBMITTED' }, orderBy: { createdAt: 'desc' } });
  if (submitter?.actorId === user.id) throw forbidden('You cannot approve a quotation you submitted. Another approver must review it.');
  const full = await db.user.findUnique({ where: { id: user.id }, select: { approvalLimit: true } });
  if (decision === 'APPROVED' && full?.approvalLimit && new Decimal(rev.total.toString()).gt(full.approvalLimit.toString())) {
    throw forbidden(`This quotation exceeds your approval limit of ${formatMoney(full.approvalLimit.toString(), rev.currency)}.`);
  }
  if (decision === 'REJECTED' && !comment?.trim()) throw invalid('Explain what needs to change.', { comment: 'A reason is required when rejecting.' });
  await db.$transaction(async (tx) => {
    await tx.quotationApproval.create({ data: { revisionId, decision, actorId: user.id, actorLabel: user.name, comment: comment?.trim() || null } });
    await tx.quotationRevision.update({
      where: { id: revisionId },
      data: decision === 'APPROVED' ? { status: 'APPROVED', approvedAt: new Date() } : { status: 'DRAFT', submittedAt: null },
    });
    await syncQuotationStatus(tx, rev.quotationId);
    await audit({ id: user.id, label: user.name }, `quotation.${decision.toLowerCase()}`, 'Quotation', rev.quotationId, { version: rev.version, comment: comment ?? null }, null, tx);
  });
  if (rev.createdById) {
    const creator = await db.user.findUnique({ where: { id: rev.createdById } });
    if (creator) {
      await enqueueEmail({
        type: 'quotation.decision',
        to: creator.email,
        subject: `Quotation ${rev.quotation.number} was ${decision === 'APPROVED' ? 'approved' : 'returned'}`,
        requestId: rev.quotation.requestId,
        ...emailTemplate({
          heading: decision === 'APPROVED' ? 'Quotation approved' : 'Quotation returned for changes',
          paragraphs: [`${user.name} ${decision === 'APPROVED' ? 'approved' : 'rejected'} quotation ${rev.quotation.number} (version ${rev.version}).`, ...(comment ? [comment] : [])],
          cta: { label: 'Open the quotation', url: `${env.APP_URL}/admin/quotations/${rev.quotationId}` },
        }),
      });
    }
  }
}

// ─── Issuing, revising, withdrawing ────────────────────────────────

export async function issueQuotation(user: Principal, revisionId: string) {
  assertCan(user, 'quotation.issue');
  const rev = await loadRevision(user, revisionId);
  if (rev.status !== 'APPROVED') throw conflict('Only an approved quotation can be issued.');
  const now = new Date();
  const validUntil = new Date(now.getTime() + rev.validityDays * 86_400_000);
  const actor = { id: user.id, label: user.name };
  let from = rev.quotation.request.status;
  await db.$transaction(async (tx) => {
    await tx.quotationRevision.update({ where: { id: revisionId }, data: { status: 'ISSUED', issuedAt: now, validUntil } });
    await syncQuotationStatus(tx, rev.quotationId);
    if (from !== 'QUOTATION_ISSUED') {
      if (from !== 'QUOTATION_IN_PREPARATION' && canTransition(from, 'QUOTATION_IN_PREPARATION')) {
        await applyStatus(tx, rev.quotation.requestId, 'QUOTATION_IN_PREPARATION', actor, { automated: true });
        from = 'QUOTATION_IN_PREPARATION';
      }
      await applyStatus(tx, rev.quotation.requestId, 'QUOTATION_ISSUED', actor, { note: `Quotation ${rev.quotation.number} (v${rev.version}) issued.`, automated: true, silent: true });
    }
    await audit(actor, 'quotation.issued', 'Quotation', rev.quotationId, { version: rev.version, validUntil }, null, tx);
  });
  await afterStatusChange(rev.quotation.requestId, from, 'QUOTATION_ISSUED', actor, { silent: true });
  const req = rev.quotation.request;
  await emitEvent('quotation.issued', { quotation: rev.quotation.number, version: rev.version, request: req.reference, total: rev.total.toString(), currency: rev.currency, validUntil: validUntil.toISOString() }, `${rev.id}`);
  await enqueueEmail({
    type: 'quotation.issued',
    to: req.requesterEmail,
    subject: `Quotation ${rev.quotation.number} for your request ${req.reference}`,
    requestId: req.id,
    ...emailTemplate({
      heading: 'Your quotation is ready',
      paragraphs: [
        `Hello ${req.requesterName},`,
        'We have issued a quotation for your request. You can review the details, download the PDF and respond in the customer portal.',
        `It is valid until ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Africa/Lagos' }).format(validUntil)}.`,
      ],
      details: [
        ['Quotation', `${rev.quotation.number} (version ${rev.version})`],
        ['Request', req.reference],
        ['Total', formatMoney(rev.total.toString(), rev.currency)],
      ],
      cta: { label: 'View the quotation', url: `${env.APP_URL}/portal/quotations/${rev.quotationId}` },
      footnote: 'Create a portal account with this email address if you do not have one yet.',
    }),
  });
}

/** Start a new draft revision of an existing quotation (the earlier revision is kept as history). */
export async function reviseQuotation(user: Principal, quotationId: string): Promise<string> {
  assertCan(user, 'quotation.create');
  const q = await db.quotation.findFirst({
    where: { id: quotationId, request: staffRequestScope(user) },
    include: { request: true, revisions: { orderBy: { version: 'desc' }, take: 1, include: { lineItems: true } } },
  });
  if (!q) throw notFound('Quotation not found.');
  const prev = q.revisions[0]!;
  if (prev.status === 'ACCEPTED') throw conflict('An accepted quotation is binding and cannot be revised. Raise a new quotation instead.');
  if (prev.status === 'DRAFT' || prev.status === 'PENDING_APPROVAL') throw conflict('The current revision has not been issued yet. Edit it instead.');
  const actor = { id: user.id, label: user.name };
  let from = q.request.status;
  const newId = await db.$transaction(async (tx) => {
    if (['ISSUED', 'VIEWED', 'APPROVED'].includes(prev.status)) {
      await tx.quotationRevision.update({ where: { id: prev.id }, data: { status: 'SUPERSEDED' } });
    }
    const rev = await tx.quotationRevision.create({
      data: {
        quotationId,
        version: prev.version + 1,
        currency: prev.currency,
        validityDays: prev.validityDays,
        title: prev.title,
        introduction: prev.introduction,
        terms: prev.terms,
        paymentTerms: prev.paymentTerms,
        subtotal: prev.subtotal,
        discountTotal: prev.discountTotal,
        taxTotal: prev.taxTotal,
        total: prev.total,
        createdById: user.id,
        createdByLabel: user.name,
      },
    });
    if (prev.lineItems.length) {
      await tx.quotationLineItem.createMany({
        data: prev.lineItems.map((l) => ({ revisionId: rev.id, sortOrder: l.sortOrder, productId: l.productId, variantId: l.variantId, sku: l.sku, description: l.description, unit: l.unit, quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent, taxPercent: l.taxPercent, lineNet: l.lineNet, lineTax: l.lineTax })),
      });
    }
    await syncQuotationStatus(tx, quotationId);
    if (from === 'QUOTATION_ISSUED') {
      await applyStatus(tx, q.requestId, 'QUOTATION_IN_PREPARATION', actor, { note: `Quotation ${q.number} is being revised (v${rev.version}).`, automated: true, silent: true });
      from = 'QUOTATION_IN_PREPARATION';
    }
    await audit(actor, 'quotation.revised', 'Quotation', quotationId, { version: rev.version }, null, tx);
    return rev.id;
  });
  return newId;
}

export async function withdrawQuotation(user: Principal, quotationId: string, reason: string) {
  assertCan(user, 'quotation.issue');
  if (!reason.trim()) throw invalid('Give a reason for withdrawing.', { reason: 'Required.' });
  const q = await db.quotation.findFirst({
    where: { id: quotationId, request: staffRequestScope(user) },
    include: { request: true, revisions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  if (!q) throw notFound('Quotation not found.');
  const rev = q.revisions[0]!;
  if (!['APPROVED', 'ISSUED', 'VIEWED'].includes(rev.status)) throw conflict('Only an approved or issued quotation can be withdrawn.');
  const actor = { id: user.id, label: user.name };
  await db.$transaction(async (tx) => {
    await tx.quotationRevision.update({ where: { id: rev.id }, data: { status: 'WITHDRAWN' } });
    await syncQuotationStatus(tx, quotationId);
    if (q.request.status === 'QUOTATION_ISSUED') {
      await applyStatus(tx, q.requestId, 'QUOTATION_IN_PREPARATION', actor, { note: `Quotation ${q.number} withdrawn: ${reason.trim()}`, automated: true, silent: true });
    }
    await audit(actor, 'quotation.withdrawn', 'Quotation', quotationId, { reason }, null, tx);
  });
}

// ─── Customer responses ────────────────────────────────────────────

export async function getCustomerQuotation(userId: string, quotationId: string) {
  const q = await db.quotation.findFirst({
    where: { id: quotationId, request: customerRequestScope(userId) },
    include: {
      request: { select: { id: true, reference: true, summary: true, status: true } },
      revisions: { where: { status: { in: CUSTOMER_VISIBLE } }, orderBy: { version: 'desc' }, include: { lineItems: { orderBy: { sortOrder: 'asc' } }, decisions: true } },
    },
  });
  if (!q || q.revisions.length === 0) throw notFound('Quotation not found.');
  return q;
}

/** Record the first time the customer opens an issued quotation. Reliable because the portal is authenticated. */
export async function markViewed(userId: string, quotationId: string) {
  const q = await getCustomerQuotation(userId, quotationId);
  const rev = q.revisions[0]!;
  if (rev.status !== 'ISSUED') return;
  const res = await db.quotationRevision.updateMany({ where: { id: rev.id, status: 'ISSUED' }, data: { status: 'VIEWED', firstViewedAt: new Date() } });
  if (res.count) await db.quotation.update({ where: { id: quotationId }, data: { status: 'VIEWED' } });
}

export async function recordCustomerDecision(userId: string, quotationId: string, decision: 'ACCEPTED' | 'DECLINED', comment: string | undefined, ip: string | null) {
  const s = await getSetting('quotes');
  if (!s.customerCanRespond) throw forbidden('Online responses are not enabled. Please contact us to confirm your decision.');
  const q = await getCustomerQuotation(userId, quotationId);
  const rev = q.revisions[0]!; // newest visible revision
  if (rev.status !== 'ISSUED' && rev.status !== 'VIEWED') throw conflict('This quotation can no longer be answered online.');
  if (rev.validUntil && rev.validUntil < new Date()) throw conflict('This quotation has expired. Please contact us for an updated quotation.');
  if (decision === 'DECLINED' && !comment?.trim()) throw invalid('Please tell us briefly why.', { comment: 'A short reason helps us improve our offer.' });
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound();
  const actor = { id: userId, label: 'Customer' };
  const reqId = q.request.id;
  let from = q.request.status;
  await db.$transaction(async (tx) => {
    // Conditional update: two simultaneous clicks cannot both succeed
    const upd = await tx.quotationRevision.updateMany({ where: { id: rev.id, status: { in: ['ISSUED', 'VIEWED'] } }, data: { status: decision } });
    if (upd.count !== 1) throw conflict('This quotation has already been answered.');
    await tx.quotationDecision.create({
      data: { quotationId, revisionId: rev.id, decision, userId, decidedByName: user.name, decidedByEmail: user.email, comment: comment?.trim() || null, ip },
    });
    await syncQuotationStatus(tx, quotationId);
    if (canTransition(from, decision === 'ACCEPTED' ? 'ACCEPTED' : 'DECLINED')) {
      await applyStatus(tx, reqId, decision === 'ACCEPTED' ? 'ACCEPTED' : 'DECLINED', actor, {
        note: decision === 'ACCEPTED' ? `Customer accepted ${q.number} (v${rev.version}).` : `Customer declined ${q.number} (v${rev.version}): ${comment!.trim()}`,
        automated: true,
        silent: true,
      });
    }
    await audit({ id: userId, label: user.name }, `quotation.customer_${decision.toLowerCase()}`, 'Quotation', quotationId, { version: rev.version, comment: comment ?? null }, ip, tx);
  });
  await afterStatusChange(reqId, from, decision === 'ACCEPTED' ? 'ACCEPTED' : 'DECLINED', actor, { silent: true }).catch(() => undefined);
  from = decision === 'ACCEPTED' ? 'ACCEPTED' : 'DECLINED';
  await emitEvent(decision === 'ACCEPTED' ? 'quotation.accepted' : 'quotation.declined', { quotation: q.number, version: rev.version, request: q.request.reference, total: rev.total.toString(), currency: rev.currency, by: user.email }, rev.id);
  await enqueueEmail({
    type: 'quotation.customer_receipt',
    to: user.email,
    subject: `We recorded your response to quotation ${q.number}`,
    requestId: reqId,
    ...emailTemplate({
      heading: decision === 'ACCEPTED' ? 'You accepted the quotation' : 'You declined the quotation',
      paragraphs: [
        `Hello ${user.name},`,
        decision === 'ACCEPTED'
          ? `We have recorded your acceptance of quotation ${q.number} (version ${rev.version}). The St. Chris team will contact you to confirm the next steps.`
          : `We have recorded that you declined quotation ${q.number} (version ${rev.version}). Thank you for letting us know.`,
      ],
      details: [['Total', formatMoney(rev.total.toString(), rev.currency)], ['Request', q.request.reference]],
    }),
  });
  await notifyInternal(
    'newRequestTo',
    `Quotation ${q.number} ${decision === 'ACCEPTED' ? 'accepted' : 'declined'} by the customer`,
    `Customer ${decision === 'ACCEPTED' ? 'accepted' : 'declined'} a quotation`,
    [`${user.name} ${decision === 'ACCEPTED' ? 'accepted' : 'declined'} ${q.number} (version ${rev.version}).`, ...(comment ? [`Comment: ${comment}`] : [])],
    `/admin/quotations/${quotationId}`,
    undefined,
    reqId,
  );
}

// ─── Offline responses recorded by staff ────────────────────────────

export const OFFLINE_CHANNELS = { PHONE: 'Phone call', PAPER: 'Signed paper copy', EMAIL: 'Email', WHATSAPP: 'WhatsApp message', MEETING: 'In-person meeting' } as const;
export type OfflineChannel = keyof typeof OFFLINE_CHANNELS;

const offlineSchema = z.object({
  decision: z.enum(['ACCEPTED', 'DECLINED']),
  channel: z.enum(['PHONE', 'PAPER', 'EMAIL', 'WHATSAPP', 'MEETING']),
  respondentName: z.string().trim().min(2, 'Enter the name of the person who answered.').max(120),
  respondentEmail: z.string().trim().email('Enter a valid email address.').max(200).optional().or(z.literal('')),
  occurredAt: z.coerce.date({ message: 'Enter when the customer gave their answer.' }),
  reference: z.string().trim().max(120).optional().default(''),
  note: z.string().trim().min(10, 'Describe how and when the answer was given (at least a sentence).').max(2000),
});

/**
 * Staff record a customer's accept/decline given outside the portal. It has the same effect as an online answer
 * (the quotation is closed, the request moves on, the customer is told), but is stored with its channel, who
 * recorded it, when the customer really answered, and the evidence, so it can always be told apart from an
 * answer the customer gave themselves.
 */
export async function recordOfflineResponse(user: Principal, quotationId: string, raw: unknown, evidence?: import('./storage').StoredFile | null) {
  assertCan(user, 'quotation.recordResponse');
  const p = offlineSchema.safeParse(raw);
  if (!p.success) throw invalid('Please check the highlighted fields.', Object.fromEntries(p.error.issues.map((i) => [i.path.join('.'), i.message])));
  const input = p.data;
  if (input.decision === 'ACCEPTED' && !input.reference && !evidence) throw invalid('An acceptance needs either the customer’s reference (for example a purchase order or signed-form number) or a supporting document.', { reference: 'Give a reference or attach evidence.' });
  const q = await db.quotation.findFirst({
    where: { id: quotationId, request: staffRequestScope(user) },
    include: { request: true, contact: true, revisions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  if (!q) throw notFound('Quotation not found.');
  const rev = q.revisions[0]!;
  if (rev.status !== 'ISSUED' && rev.status !== 'VIEWED') throw conflict('Only a quotation that has been issued to the customer and is still open can be answered. Revise or re-issue it first.');
  const now = new Date();
  if (input.occurredAt.getTime() > now.getTime() + 5 * 60_000) throw invalid('The date of the answer cannot be in the future.', { occurredAt: 'In the future.' });
  if (rev.issuedAt && input.occurredAt < rev.issuedAt) throw invalid('The customer cannot have answered before the quotation was issued.', { occurredAt: 'Before the quotation was issued.' });
  if (input.decision === 'ACCEPTED' && rev.validUntil && input.occurredAt > rev.validUntil) throw invalid('The customer answered after the quotation expired. Create a new revision and have them confirm it.', { occurredAt: 'After the quotation expired.' });
  const actor = { id: user.id, label: user.name };
  const reqId = q.request.id;
  const from = q.request.status;
  const email = input.respondentEmail || q.contact?.email || '';
  let documentId: string | null = null;
  await db.$transaction(async (tx) => {
    const upd = await tx.quotationRevision.updateMany({ where: { id: rev.id, status: { in: ['ISSUED', 'VIEWED'] } }, data: { status: input.decision } });
    if (upd.count !== 1) throw conflict('This quotation has already been answered.');
    if (evidence) {
      const d = await tx.document.create({ data: { ...evidence, visibility: 'INTERNAL', title: `Evidence: ${input.decision === 'ACCEPTED' ? 'acceptance' : 'decline'} of ${q.number}`, requestId: reqId, quotationId, companyId: q.request.companyId, uploadedById: user.id, uploadedByLabel: user.name } });
      documentId = d.id;
    }
    await tx.quotationDecision.create({
      data: {
        quotationId, revisionId: rev.id, decision: input.decision, userId: null, decidedByName: input.respondentName, decidedByEmail: email,
        comment: input.note, channel: input.channel, recordedById: user.id, recordedByName: user.name, occurredAt: input.occurredAt, reference: input.reference || null, evidenceDocumentId: documentId,
      },
    });
    await syncQuotationStatus(tx, quotationId);
    const to = input.decision === 'ACCEPTED' ? 'ACCEPTED' : 'DECLINED';
    if (canTransition(from, to)) {
      await applyStatus(tx, reqId, to, actor, {
        note: `${user.name} recorded that ${input.respondentName} ${input.decision === 'ACCEPTED' ? 'accepted' : 'declined'} ${q.number} (v${rev.version}) by ${OFFLINE_CHANNELS[input.channel].toLowerCase()} on ${input.occurredAt.toISOString().slice(0, 10)}${input.reference ? `, reference ${input.reference}` : ''}.`,
        automated: false,
        silent: true,
      });
    }
    await audit(actor, `quotation.offline_${input.decision.toLowerCase()}`, 'Quotation', quotationId, { version: rev.version, channel: input.channel, respondent: input.respondentName, occurredAt: input.occurredAt.toISOString(), reference: input.reference || null, evidenceDocumentId: documentId }, null, tx);
  });
  await afterStatusChange(reqId, from, input.decision === 'ACCEPTED' ? 'ACCEPTED' : 'DECLINED', actor, { silent: true }).catch(() => undefined);
  await emitEvent(input.decision === 'ACCEPTED' ? 'quotation.accepted' : 'quotation.declined', { quotation: q.number, version: rev.version, request: q.request.reference, total: rev.total.toString(), currency: rev.currency, by: email || input.respondentName, channel: input.channel, recordedBy: user.email }, rev.id);
  if (email) {
    await enqueueEmail({
      type: 'quotation.customer_receipt',
      to: email,
      subject: `We recorded your response to quotation ${q.number}`,
      requestId: reqId,
      ...emailTemplate({
        heading: input.decision === 'ACCEPTED' ? 'We recorded your acceptance' : 'We recorded that you declined',
        paragraphs: [
          `Hello ${input.respondentName},`,
          `As discussed (${OFFLINE_CHANNELS[input.channel].toLowerCase()}), we have recorded that you ${input.decision === 'ACCEPTED' ? 'accepted' : 'declined'} quotation ${q.number} (version ${rev.version}).${input.decision === 'ACCEPTED' ? ' The St. Chris team will contact you to confirm the next steps.' : ''}`,
          'If this is not what you intended, please reply to this email straight away.',
        ],
        details: [['Total', formatMoney(rev.total.toString(), rev.currency)], ['Request', q.request.reference]],
      }),
    });
  }
}

// ─── Expiry (scheduled job) ────────────────────────────────────────

export async function expireQuotations(now = new Date()): Promise<number> {
  const due = await db.quotationRevision.findMany({
    where: { status: { in: ['ISSUED', 'VIEWED'] }, validUntil: { lt: now } },
    include: { quotation: { include: { request: true } } },
  });
  let n = 0;
  for (const rev of due) {
    try {
      await db.$transaction(async (tx) => {
        const upd = await tx.quotationRevision.updateMany({ where: { id: rev.id, status: { in: ['ISSUED', 'VIEWED'] } }, data: { status: 'EXPIRED' } });
        if (upd.count !== 1) return;
        await syncQuotationStatus(tx, rev.quotationId);
        const r = rev.quotation.request;
        if (r.status === 'QUOTATION_ISSUED') {
          await applyStatus(tx, r.id, 'EXPIRED', { id: null, label: 'System' }, { note: `Quotation ${rev.quotation.number} (v${rev.version}) expired without a decision.`, automated: true, silent: true });
        }
        await audit({ id: null, label: 'System' }, 'quotation.expired', 'Quotation', rev.quotationId, { version: rev.version }, null, tx);
        n++;
      });
    } catch (e) {
      console.error('[quotations] expiry failed for', rev.id, e);
    }
  }
  return n;
}

// ─── Staff queries ─────────────────────────────────────────────────

export interface QuotationFilters {
  q?: string;
  status?: QuotationStatus | '';
  from?: string;
  to?: string;
  page?: number;
}

export async function listQuotations(user: Principal, f: QuotationFilters) {
  if (!can(user.role, 'quotation.view')) throw forbidden();
  const and: Prisma.QuotationWhereInput[] = [{ request: staffRequestScope(user) }];
  if (f.status) and.push({ status: f.status });
  if (f.q?.trim()) and.push({ OR: [{ number: { contains: f.q.trim(), mode: 'insensitive' } }, { request: { reference: { contains: f.q.trim(), mode: 'insensitive' } } }, { request: { requesterName: { contains: f.q.trim(), mode: 'insensitive' } } }, { request: { companyName: { contains: f.q.trim(), mode: 'insensitive' } } }] });
  if (f.from) and.push({ createdAt: { gte: new Date(`${f.from}T00:00:00.000Z`) } });
  if (f.to) and.push({ createdAt: { lte: new Date(`${f.to}T23:59:59.999Z`) } });
  const pageSize = 20;
  const page = Math.max(f.page ?? 1, 1);
  const [total, items] = await Promise.all([
    db.quotation.count({ where: { AND: and } }),
    db.quotation.findMany({
      where: { AND: and },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { request: { select: { id: true, reference: true, requesterName: true, companyName: true } }, revisions: { orderBy: { version: 'desc' }, take: 1, select: { version: true, total: true, currency: true, validUntil: true, status: true } } },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function getQuotationForStaff(user: Principal, id: string) {
  if (!can(user.role, 'quotation.view')) throw forbidden();
  const q = await db.quotation.findFirst({
    where: { id, request: staffRequestScope(user) },
    include: {
      request: { include: { service: { select: { name: true } } } },
      createdBy: { select: { name: true } },
      revisions: { orderBy: { version: 'desc' }, include: { lineItems: { orderBy: { sortOrder: 'asc' } }, approvals: { orderBy: { createdAt: 'asc' } }, decisions: true } },
    },
  });
  if (!q) throw notFound('Quotation not found.');
  return q;
}

export { STATUS_LABELS };
