import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import type { CommType, RequestStatus } from '@/generated/prisma/enums';
import { db, type Tx } from './db';
import { env } from './env';
import { audit, type Actor } from './audit';
import { AppError, conflict, forbidden, invalid, notFound } from './errors';
import { assertCan, customerRequestScope, staffRequestScope, type Principal } from './rbac';
import { clientIp, rateLimit } from './rate-limit';
import { enqueueEmail, notifyInternal } from './notify';
import { getDepartment } from './departments';
import { emailTemplate } from './email-templates';
import { getSetting } from './settings';
import { saveUpload, deleteStored, MAX_FILES_PER_UPLOAD, type StoredFile } from './storage';
import { hmac, safeEqual } from './crypto';
import { emitEvent } from './integrations/events';
import { can } from '@/lib/permissions';
import {
  requestSubmissionSchema,
  validateDetails,
  displayValue,
  type FieldDef,
} from '@/lib/validation';
import { canTransition, QUOTATION_DRIVEN, REASON_REQUIRED, STATUS_CUSTOMER_TEXT, STATUS_LABELS, TERMINAL_STATUSES } from '@/lib/workflow';

// ─── Reference numbers ─────────────────────────────────────────────

export async function nextReference(tx: Tx, prefix = 'SCG'): Promise<string> {
  const year = new Date().getUTCFullYear();
  const key = `request:${year}`;
  const c = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return `${prefix}-${year}-${String(c.value).padStart(5, '0')}`;
}

export const confirmationToken = (reference: string) => hmac(reference, 'confirmation').slice(0, 22);
export const confirmationUrl = (reference: string) => `/request/confirmation/${reference}?t=${confirmationToken(reference)}`;
export const verifyConfirmationToken = (reference: string, t: string) => safeEqual(t, confirmationToken(reference));

// ─── Submission ────────────────────────────────────────────────────

export interface SubmitContext {
  files?: File[];
  /** Set when submitted from a signed-in portal account */
  user?: { id: string } | null;
  source?: string;
  repeatOfId?: string | null;
}

function sanitiseFields(fields: { key: string; label: string; type: string; required: boolean; options: unknown; unit: string | null; helpText: string | null; placeholder: string | null; section: string }[]): FieldDef[] {
  return fields.map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type as FieldDef['type'],
    required: f.required,
    options: Array.isArray(f.options) ? (f.options as string[]) : null,
    unit: f.unit,
    helpText: f.helpText,
    placeholder: f.placeholder,
    section: f.section,
  }));
}

function parseDate(v: unknown): Date | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null;
}

export async function submitRequest(raw: unknown, ctx: SubmitContext = {}): Promise<{ reference: string; id: string; duplicate: boolean }> {
  const parsed = requestSubmissionSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[i.path.join('.')] = i.message;
    throw invalid('Please check the highlighted fields.', fields);
  }
  const input = parsed.data;
  const ip = await clientIp();
  if (!(await rateLimit(`submit:ip:${ip}`, 8, 10 * 60)) || !(await rateLimit(`submit:email:${input.customer.email}`, 6, 60 * 60))) {
    throw new AppError('RATE_LIMITED', 'You have sent several requests in a short time. Please wait a little before sending another, or call us.');
  }

  // Duplicate submission (double-click, retry after a slow network): return the original
  const dup = await db.quoteRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, reference: true } });
  if (dup) return { reference: dup.reference, id: dup.id, duplicate: true };

  const service = await db.service.findFirst({
    where: { id: input.serviceId, visible: true },
    include: { fields: { where: { visible: true }, orderBy: { sortOrder: 'asc' } } },
  });
  if (!service) throw invalid('That service is not available. Please choose another.');
  const defs = sanitiseFields(service.fields);
  const { values, errors } = validateDetails(defs, input.details);
  if (Object.keys(errors).length) throw invalid('Please check the highlighted fields.', Object.fromEntries(Object.entries(errors).map(([k, v]) => [`details.${k}`, v])));

  const files = (ctx.files ?? []).filter((f) => f.size > 0);
  if (files.length > MAX_FILES_PER_UPLOAD) throw invalid(`Attach at most ${MAX_FILES_PER_UPLOAD} files.`);
  const stored: StoredFile[] = [];
  try {
    for (const f of files) stored.push(await saveUpload(f));
  } catch (e) {
    await Promise.all(stored.map((s) => deleteStored(s.storageKey)));
    throw e;
  }

  const customer = input.customer;
  const labels = Object.fromEntries(defs.map((f) => [f.key, { label: f.label, type: f.type, unit: f.unit ?? null, section: f.section ?? 'Requirement' }]));
  // Catalogue lines: for catalogue items the label, unit and SKU are taken from the catalogue, not from the browser
  if (service.acceptsItems && input.items.length === 0 && files.length === 0) throw invalid('Add at least one item to your project list, or attach a bill of quantities.', { items: 'Add at least one item.' });
  const productIds = [...new Set(input.items.map((i) => i.productId).filter((x): x is string => !!x))];
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds }, status: 'PUBLISHED' }, include: { variants: true } })
    : [];
  const items = input.items.map((i, n) => {
    const p = i.productId ? products.find((x) => x.id === i.productId) : undefined;
    if (i.productId && !p) throw invalid('One of the products on your list is no longer available. Please remove it and try again.', { items: 'A product is no longer available.' });
    const v = p && i.variantId ? p.variants.find((x) => x.id === i.variantId) : undefined;
    return {
      productId: p?.id ?? null,
      variantId: v?.id ?? null,
      sku: v?.sku ?? null,
      label: p ? (v ? `${p.name}: ${v.label}` : p.name) : i.label,
      unit: v?.unit ?? i.unit,
      quantity: i.quantity,
      note: i.note?.trim() || null,
      sortOrder: n,
    };
  });
  const project = typeof values.project_name === 'string' && values.project_name ? values.project_name : null;
  const destination = typeof values.site_location === 'string' ? values.site_location : typeof values.delivery_location === 'string' ? values.delivery_location : null;
  const origin: string | null = null;
  const summary = [service.name, project, items.length ? `${items.length} ${items.length === 1 ? 'line' : 'lines'}` : null, destination]
    .filter(Boolean)
    .join(' · ');

  try {
    const result = await db.$transaction(async (tx) => {
      // CRM: company and contact (guests become records here; accounts are linked on email verification)
      let companyId: string | null = null;
      let contactId: string | null = null;
      if (ctx.user) {
        const m = await tx.companyMembership.findFirst({ where: { userId: ctx.user.id }, orderBy: { createdAt: 'asc' } });
        companyId = m?.companyId ?? null;
        const c = await tx.contact.findFirst({ where: { userId: ctx.user.id } });
        contactId = c?.id ?? null;
      } else if (customer.companyName) {
        const existing = await tx.company.findFirst({ where: { name: { equals: customer.companyName, mode: 'insensitive' } } });
        companyId = existing?.id ?? (await tx.company.create({ data: { name: customer.companyName } })).id;
      }
      if (!contactId) {
        const found = await tx.contact.findFirst({ where: { email: customer.email, companyId } });
        contactId =
          found?.id ??
          (await tx.contact.create({ data: { name: customer.name, email: customer.email, phone: customer.phone, jobTitle: customer.jobTitle || null, companyId } })).id;
      }
      const reference = await nextReference(tx);
      const req = await tx.quoteRequest.create({
        data: {
          reference,
          serviceId: service.id,
          department: service.department,
          details: values as Prisma.InputJsonValue,
          detailLabels: labels as Prisma.InputJsonValue,
          summary,
          recurrence: input.recurrence,
          neededFrom: parseDate(values.start_date) ?? parseDate(values.required_from),
          neededBy: parseDate(values.end_date) ?? parseDate(values.required_by),
          origin,
          destination,
          source: ctx.source ?? 'website',
          idempotencyKey: input.idempotencyKey,
          requesterName: customer.name,
          requesterEmail: customer.email,
          requesterPhone: customer.phone,
          smsOptIn: input.messaging.sms,
          whatsappOptIn: input.messaging.whatsapp,
          companyName: customer.companyName || null,
          companyId,
          contactId,
          submittedByUserId: ctx.user?.id ?? null,
          repeatOfId: ctx.repeatOfId ?? null,
        },
      });
      if (items.length) await tx.quoteRequestItem.createMany({ data: items.map((i) => ({ ...i, requestId: req.id })) });
      await tx.statusHistory.create({
        data: { requestId: req.id, fromStatus: null, toStatus: 'RECEIVED', actorLabel: ctx.user ? 'Customer' : 'Customer (website)', actorId: ctx.user?.id ?? null },
      });
      for (const s of stored) {
        await tx.document.create({
          data: { ...s, visibility: 'CUSTOMER', requestId: req.id, companyId, uploadedById: ctx.user?.id ?? null, uploadedByLabel: customer.name },
        });
      }
      await audit({ id: ctx.user?.id ?? null, label: customer.name }, 'request.submitted', 'QuoteRequest', req.id, { reference, service: service.slug, files: stored.length, lines: items.length }, ip, tx);
      return { id: req.id, reference };
    });

    // Everything below is best-effort: the request is already safely stored
    await afterSubmit(result.id).catch((e) => console.error('[requests] post-submit tasks failed', e));
    return { ...result, duplicate: false };
  } catch (e) {
    await Promise.all(stored.map((s) => deleteStored(s.storageKey)));
    // A concurrent identical submission lost the race on the idempotency key
    const again = await db.quoteRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, reference: true } });
    if (again) return { reference: again.reference, id: again.id, duplicate: true };
    throw e;
  }
}

function requestPayload(req: { id: string; reference: string; status: string; summary: string | null; requesterName: string; requesterEmail: string; requesterPhone: string | null; companyName: string | null; submittedAt: Date }, service: string) {
  return {
    id: req.id,
    reference: req.reference,
    status: req.status,
    service,
    summary: req.summary,
    submittedAt: req.submittedAt.toISOString(),
    requester: { name: req.requesterName, email: req.requesterEmail, phone: req.requesterPhone, company: req.companyName },
  };
}

async function afterSubmit(requestId: string) {
  const req = await db.quoteRequest.findUnique({ where: { id: requestId }, include: { service: true } });
  if (!req) return;
  const notif = await getSetting('notifications');
  await emitEvent('request.submitted', requestPayload(req, req.service.name), req.id);
  // Customer confirmation — explicit that this is not a booking or a quotation
  await enqueueEmail({
    type: 'request.confirmation',
    to: req.requesterEmail,
    subject: `We received your request ${req.reference}`,
    requestId: req.id,
    ...emailTemplate({
      heading: 'We have received your request',
      paragraphs: [
        `Hello ${req.requesterName},`,
        'Thank you for contacting St. Chris. Your request has been recorded and a member of the team will review it.',
        'Please note that submitting a request is not a confirmed booking, an accepted quotation, or a commitment by St. Chris. We will contact you if we need more information, and any price will come to you in a formal quotation.',
      ],
      details: [
        ['Reference', req.reference],
        ['Request type', req.service.name],
        ['Submitted', new Date(req.submittedAt).toUTCString()],
      ],
      cta: { label: 'View your confirmation', url: `${env.APP_URL}${confirmationUrl(req.reference)}` },
      footnote: 'Quote your reference number whenever you contact us about this request.',
    }),
  });
  const dept = await getDepartment(req.department);
  await notifyInternal(
    'newRequestTo',
    `New request ${req.reference} — ${req.service.name}${dept ? ` (${dept.label})` : ''}`,
    'New request received',
    [`${req.requesterName}${req.companyName ? ` (${req.companyName})` : ''} has submitted a request for ${req.service.name}.`],
    `/admin/requests/${req.id}`,
    [
      ['Reference', req.reference],
      ['Routed to', dept?.label ?? req.department],
      ['Summary', req.summary ?? '—'],
      ['Contact', `${req.requesterEmail} · ${req.requesterPhone ?? '—'}`],
    ],
    req.id,
    dept?.recipients,
  );
  const days = notif.followUpDays.RECEIVED;
  if (days) {
    await db.task.create({
      data: {
        title: `Review new request ${req.reference}`,
        dueAt: new Date(Date.now() + days * 86_400_000),
        requestId: req.id,
        createdByLabel: 'System',
        origin: 'AUTO',
      },
    });
  }
}

// ─── Listing and detail (staff) ────────────────────────────────────

export interface RequestFilters {
  q?: string;
  status?: RequestStatus | 'OPEN' | '';
  serviceId?: string;
  assigneeId?: string; // user id or "unassigned"
  companyId?: string;
  contactId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  followUpDue?: boolean;
}

export const OPEN_FILTER: RequestStatus[] = ['RECEIVED', 'UNDER_REVIEW', 'MORE_INFO_REQUIRED', 'QUOTATION_IN_PREPARATION', 'QUOTATION_ISSUED', 'ACCEPTED', 'IN_PROGRESS'];

export function requestWhere(user: Principal, f: RequestFilters): Prisma.QuoteRequestWhereInput {
  const and: Prisma.QuoteRequestWhereInput[] = [staffRequestScope(user)];
  if (f.q?.trim()) {
    const q = f.q.trim();
    and.push({
      OR: [
        { reference: { contains: q, mode: 'insensitive' } },
        { requesterName: { contains: q, mode: 'insensitive' } },
        { requesterEmail: { contains: q, mode: 'insensitive' } },
        { companyName: { contains: q, mode: 'insensitive' } },
        { summary: { contains: q, mode: 'insensitive' } },
      ],
    });
  }
  if (f.status === 'OPEN') and.push({ status: { in: OPEN_FILTER } });
  else if (f.status) and.push({ status: f.status });
  if (f.serviceId) and.push({ serviceId: f.serviceId });
  if (f.assigneeId === 'unassigned') and.push({ assigneeId: null });
  else if (f.assigneeId) and.push({ assigneeId: f.assigneeId });
  if (f.companyId) and.push({ companyId: f.companyId });
  if (f.contactId) and.push({ contactId: f.contactId });
  if (f.from) and.push({ submittedAt: { gte: new Date(`${f.from}T00:00:00.000Z`) } });
  if (f.to) and.push({ submittedAt: { lte: new Date(`${f.to}T23:59:59.999Z`) } });
  if (f.followUpDue) and.push({ tasks: { some: { status: 'OPEN', dueAt: { lt: new Date() } } } });
  return { AND: and };
}

export async function listRequests(user: Principal, f: RequestFilters) {
  if (!can(user.role, 'request.view.all') && !can(user.role, 'request.view.assigned')) throw forbidden();
  const pageSize = Math.min(Math.max(f.pageSize ?? 20, 5), 100);
  const page = Math.max(f.page ?? 1, 1);
  const where = requestWhere(user, f);
  const [total, items] = await Promise.all([
    db.quoteRequest.count({ where }),
    db.quoteRequest.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { service: { select: { name: true, slug: true } }, assignee: { select: { id: true, name: true } } },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function getRequestForStaff(user: Principal, id: string) {
  if (!can(user.role, 'request.view.all') && !can(user.role, 'request.view.assigned')) throw forbidden();
  const req = await db.quoteRequest.findFirst({
    where: { AND: [{ id }, staffRequestScope(user)] },
    include: {
      service: true,
      items: { orderBy: { sortOrder: 'asc' } },
      assignee: { select: { id: true, name: true, email: true } },
      company: true,
      contact: true,
      history: { orderBy: { createdAt: 'desc' } },
      communications: { orderBy: { occurredAt: 'desc' } },
      infoRequests: { orderBy: { createdAt: 'desc' } },
      tasks: { orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], include: { assignee: { select: { name: true } } } },
      documents: { orderBy: { createdAt: 'desc' } },
      quotations: { orderBy: { createdAt: 'desc' }, include: { revisions: { orderBy: { version: 'desc' }, take: 1 } } },
    },
  });
  if (!req) throw notFound('Request not found.');
  return req;
}

async function loadScoped(user: Principal, id: string) {
  const req = await db.quoteRequest.findFirst({ where: { AND: [{ id }, staffRequestScope(user)] } });
  if (!req) throw notFound('Request not found.');
  return req;
}

// ─── Workflow engine ───────────────────────────────────────────────

export interface TransitionOptions {
  note?: string;
  /** System/customer-driven transitions skip the manual-menu restrictions but still must follow the lifecycle map */
  automated?: boolean;
  /** Suppress the customer email (used when another email already covers the event) */
  silent?: boolean;
}

/**
 * The single place where a request changes status. Records history, timestamps, follow-up tasks,
 * customer notification and the audit trail in one transaction (emails are queued after commit).
 */
export async function applyStatus(tx: Tx, requestId: string, to: RequestStatus, actor: Actor, opts: TransitionOptions = {}) {
  const req = await tx.quoteRequest.findUnique({ where: { id: requestId }, include: { service: { select: { name: true } } } });
  if (!req) throw notFound('Request not found.');
  if (req.status === to) return { changed: false as const, req };
  if (!canTransition(req.status, to)) {
    throw conflict(`A request cannot move from “${STATUS_LABELS[req.status]}” to “${STATUS_LABELS[to]}”.`);
  }
  if (REASON_REQUIRED.includes(to) && !opts.note?.trim()) throw invalid('Please record a reason.', { note: 'A reason is required.' });
  const now = new Date();
  const updated = await tx.quoteRequest.update({
    where: { id: requestId },
    data: {
      status: to,
      statusChangedAt: now,
      closedReason: REASON_REQUIRED.includes(to) ? opts.note!.trim() : to === 'CLOSED' ? undefined : null,
      completedAt: to === 'COMPLETED' ? now : req.completedAt,
      nextFollowUpAt: null,
    },
  });
  await tx.statusHistory.create({
    data: { requestId, fromStatus: req.status, toStatus: to, actorId: actor.id ?? null, actorLabel: actor.label, note: opts.note?.trim() || null },
  });
  await audit(actor, 'request.status', 'QuoteRequest', requestId, { from: req.status, to, note: opts.note ?? null }, null, tx);
  // Terminal states close outstanding follow-ups
  if (TERMINAL_STATUSES.includes(to)) {
    await tx.task.updateMany({ where: { requestId, status: 'OPEN', origin: 'AUTO' }, data: { status: 'CANCELLED' } });
  }
  return { changed: true as const, req: updated, from: req.status, serviceName: req.service.name, actor, opts };
}

/** Follow-up tasks and customer email after a committed status change. */
export async function afterStatusChange(requestId: string, from: RequestStatus, to: RequestStatus, actor: Actor, opts: TransitionOptions) {
  const req = await db.quoteRequest.findUnique({ where: { id: requestId }, include: { service: { select: { name: true } } } });
  if (!req) return;
  const s = await getSetting('notifications');
  const days = s.followUpDays[to];
  if (days && !TERMINAL_STATUSES.includes(to)) {
    const due = new Date(Date.now() + days * 86_400_000);
    await db.task.create({
      data: {
        title: `Follow up: ${req.reference} is “${STATUS_LABELS[to]}”`,
        dueAt: due,
        requestId,
        assigneeId: req.assigneeId,
        createdByLabel: 'System',
        origin: 'AUTO',
      },
    });
    await db.quoteRequest.update({ where: { id: requestId }, data: { nextFollowUpAt: due } });
  }
  if (!opts.silent && s.customerStatusEmails.includes(to)) {
    await enqueueEmail({
      type: 'request.status',
      to: req.requesterEmail,
      subject: `Update on your request ${req.reference}: ${STATUS_LABELS[to]}`,
      requestId,
      ...emailTemplate({
        heading: `Your request is now: ${STATUS_LABELS[to]}`,
        paragraphs: [`Hello ${req.requesterName},`, STATUS_CUSTOMER_TEXT[to]],
        details: [
          ['Reference', req.reference],
          ['Service', req.service.name],
        ],
        cta: { label: 'View in the portal', url: `${env.APP_URL}/portal/requests/${req.id}` },
        footnote: 'If you do not have a portal account yet, create one with this email address to see all your requests in one place.',
      }),
    });
  }
  await emitEvent('request.status_changed', { ...requestPayload(req, req.service.name), from, to, by: actor.label }, `${requestId}:${to}:${Date.now()}`);
}

export async function changeStatus(user: Principal, id: string, to: RequestStatus, note?: string) {
  assertCan(user, 'request.status');
  if (REASON_REQUIRED.includes(to)) assertCan(user, 'request.close');
  if (QUOTATION_DRIVEN.includes(to)) throw conflict('That status is set by the quotation workflow (issuing or accepting a quotation), not chosen by hand.');
  await loadScoped(user, id);
  const actor = { id: user.id, label: user.name };
  const res = await db.$transaction((tx) => applyStatus(tx, id, to, actor, { note }));
  if (res.changed) await afterStatusChange(id, res.from, to, actor, { note });
  return res.changed;
}

// ─── Assignment, notes, communications ─────────────────────────────

export async function assignRequest(user: Principal, id: string, assigneeId: string | null) {
  assertCan(user, 'request.assign');
  const req = await loadScoped(user, id);
  let label = 'Unassigned';
  if (assigneeId) {
    const a = await db.user.findFirst({ where: { id: assigneeId, isActive: true, role: { not: 'CUSTOMER' } } });
    if (!a) throw invalid('That team member cannot be assigned.');
    label = a.name;
  }
  if (req.assigneeId === assigneeId) return;
  await db.$transaction(async (tx) => {
    await tx.quoteRequest.update({ where: { id }, data: { assigneeId } });
    await tx.communication.create({
      data: { type: 'NOTE', direction: 'INTERNAL', body: `Assigned to ${label}.`, requestId: id, authorId: user.id, authorLabel: user.name },
    });
    await tx.task.updateMany({ where: { requestId: id, status: 'OPEN', origin: 'AUTO', assigneeId: req.assigneeId }, data: { assigneeId } });
    await audit({ id: user.id, label: user.name }, 'request.assign', 'QuoteRequest', id, { to: assigneeId }, null, tx);
  });
  if (assigneeId && assigneeId !== user.id) {
    const a = await db.user.findUnique({ where: { id: assigneeId } });
    if (a) {
      await enqueueEmail({
        type: 'request.assigned',
        to: a.email,
        subject: `Request ${req.reference} was assigned to you`,
        requestId: id,
        ...emailTemplate({
          heading: 'A request was assigned to you',
          paragraphs: [`${user.name} assigned request ${req.reference} to you.`],
          cta: { label: 'Open the request', url: `${env.APP_URL}/admin/requests/${id}` },
        }),
      });
    }
  }
}

export interface CommInput {
  type: CommType;
  body: string;
  subject?: string;
  customerVisible?: boolean;
  occurredAt?: Date;
}

export async function addCommunication(user: Principal, requestId: string, input: CommInput) {
  assertCan(user, 'request.note');
  const body = input.body.trim();
  if (!body) throw invalid('Write something first.', { body: 'This cannot be empty.' });
  if (body.length > 8000) throw invalid('That is too long (8,000 characters maximum).');
  const req = await loadScoped(user, requestId);
  const isNote = input.type === 'NOTE';
  const visible = !isNote && !!input.customerVisible;
  const comm = await db.communication.create({
    data: {
      type: input.type,
      direction: isNote ? 'INTERNAL' : 'OUTBOUND',
      subject: input.subject?.trim() || null,
      body,
      customerVisible: visible, // internal notes can never be made visible
      requestId,
      companyId: req.companyId,
      contactId: req.contactId,
      authorId: user.id,
      authorLabel: user.name,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
  await audit({ id: user.id, label: user.name }, `request.${isNote ? 'note' : 'communication'}`, 'QuoteRequest', requestId, { type: input.type, visible });
  if (input.type === 'MESSAGE') {
    // A message to the customer is emailed; only mark delivered when the provider accepts it (see notification outbox)
    await enqueueEmail({
      type: 'request.message',
      to: req.requesterEmail,
      subject: input.subject?.trim() || `A message about your request ${req.reference}`,
      requestId,
      ...emailTemplate({
        heading: `A message about ${req.reference}`,
        paragraphs: [`Hello ${req.requesterName},`, body],
        cta: { label: 'View in the portal', url: `${env.APP_URL}/portal/requests/${req.id}` },
      }),
    });
  }
  return comm;
}

// ─── Additional information ────────────────────────────────────────

export async function requestMoreInfo(user: Principal, requestId: string, question: string) {
  assertCan(user, 'request.status');
  const q = question.trim();
  if (q.length < 5) throw invalid('Say what information you need.', { question: 'Please write your question.' });
  const req = await loadScoped(user, requestId);
  if (TERMINAL_STATUSES.includes(req.status)) throw conflict('This request is closed. Reopen it first.');
  const actor = { id: user.id, label: user.name };
  await db.$transaction(async (tx) => {
    await tx.infoRequest.create({ data: { requestId, question: q, askedById: user.id, askedByLabel: user.name } });
    await tx.communication.create({
      data: { type: 'MESSAGE', direction: 'OUTBOUND', subject: 'Additional information requested', body: q, customerVisible: true, requestId, companyId: req.companyId, contactId: req.contactId, authorId: user.id, authorLabel: user.name },
    });
    if (req.status !== 'MORE_INFO_REQUIRED' && canTransition(req.status, 'MORE_INFO_REQUIRED')) {
      await applyStatus(tx, requestId, 'MORE_INFO_REQUIRED', actor, { note: 'Additional information requested from the customer.', silent: true } as TransitionOptions);
    }
    await audit(actor, 'request.info_requested', 'QuoteRequest', requestId, undefined, null, tx);
  });
  await afterStatusChange(requestId, req.status, 'MORE_INFO_REQUIRED', actor, { silent: true });
  await enqueueEmail({
    type: 'request.info_requested',
    to: req.requesterEmail,
    subject: `We need a little more information — ${req.reference}`,
    requestId,
    ...emailTemplate({
      heading: 'We need a little more information',
      paragraphs: [`Hello ${req.requesterName},`, 'To continue with your request we need the following from you:', q],
      cta: { label: 'Reply in the portal', url: `${env.APP_URL}/portal/requests/${req.id}` },
      footnote: 'You can also reply to this email or call us, quoting your reference number.',
    }),
  });
}

export async function answerInfoRequest(customerUserId: string, infoId: string, answer: string, files: File[] = []) {
  const text = answer.trim();
  if (text.length < 2) throw invalid('Please write your answer.', { answer: 'This cannot be empty.' });
  if (files.length > MAX_FILES_PER_UPLOAD) throw invalid(`Attach at most ${MAX_FILES_PER_UPLOAD} files.`);
  const info = await db.infoRequest.findFirst({ where: { id: infoId, request: customerRequestScope(customerUserId) }, include: { request: true } });
  if (!info) throw notFound('Request not found.');
  if (info.status !== 'OPEN') throw conflict('This question has already been answered.');
  const user = await db.user.findUnique({ where: { id: customerUserId } });
  const label = user?.name ?? 'Customer';
  const stored: StoredFile[] = [];
  try {
    for (const f of files.filter((x) => x.size > 0)) stored.push(await saveUpload(f));
  } catch (e) {
    await Promise.all(stored.map((s) => deleteStored(s.storageKey)));
    throw e;
  }
  const actor = { id: customerUserId, label: 'Customer' };
  let moved = false;
  await db.$transaction(async (tx) => {
    await tx.infoRequest.update({ where: { id: infoId }, data: { status: 'ANSWERED', answer: text, answeredAt: new Date(), answeredByLabel: label } });
    await tx.communication.create({
      data: { type: 'MESSAGE', direction: 'INBOUND', subject: 'Reply to additional information request', body: text, customerVisible: true, requestId: info.requestId, companyId: info.request.companyId, contactId: info.request.contactId, authorId: customerUserId, authorLabel: label },
    });
    for (const s of stored) {
      await tx.document.create({ data: { ...s, visibility: 'CUSTOMER', requestId: info.requestId, companyId: info.request.companyId, uploadedById: customerUserId, uploadedByLabel: label } });
    }
    const stillOpen = await tx.infoRequest.count({ where: { requestId: info.requestId, status: 'OPEN' } });
    if (stillOpen === 0 && info.request.status === 'MORE_INFO_REQUIRED') {
      await applyStatus(tx, info.requestId, 'UNDER_REVIEW', actor, { note: 'Customer supplied the requested information.', silent: true } as TransitionOptions);
      moved = true;
    }
    await audit({ id: customerUserId, label }, 'request.info_answered', 'QuoteRequest', info.requestId, { files: stored.length }, null, tx);
  });
  if (moved) await afterStatusChange(info.requestId, 'MORE_INFO_REQUIRED', 'UNDER_REVIEW', actor, { silent: true });
  const recipients = info.request.assigneeId ? await db.user.findMany({ where: { id: info.request.assigneeId }, select: { email: true } }) : [];
  if (recipients.length) {
    for (const r of recipients) {
      await enqueueEmail({
        type: 'internal.info_answered',
        to: r.email,
        subject: `Customer replied — ${info.request.reference}`,
        requestId: info.requestId,
        ...emailTemplate({ heading: 'The customer replied', paragraphs: [text.slice(0, 500)], cta: { label: 'Open the request', url: `${env.APP_URL}/admin/requests/${info.requestId}` } }),
      });
    }
  } else {
    await notifyInternal('newRequestTo', `Customer replied — ${info.request.reference}`, 'The customer replied', [text.slice(0, 500)], `/admin/requests/${info.requestId}`, undefined, info.requestId);
  }
}

// ─── Tasks / follow-ups ────────────────────────────────────────────

export async function createTask(user: Principal, input: { title: string; dueAt: Date; requestId?: string | null; companyId?: string | null; assigneeId?: string | null; notes?: string }) {
  assertCan(user, 'task.manage');
  const title = input.title.trim();
  if (!title) throw invalid('Give the follow-up a title.', { title: 'Required.' });
  if (Number.isNaN(input.dueAt.getTime())) throw invalid('Choose a due date.', { dueAt: 'Required.' });
  if (input.requestId) await loadScoped(user, input.requestId);
  const t = await db.task.create({
    data: { title, notes: input.notes?.trim() || null, dueAt: input.dueAt, requestId: input.requestId ?? null, companyId: input.companyId ?? null, assigneeId: input.assigneeId ?? user.id, createdByLabel: user.name },
  });
  if (input.requestId) await db.quoteRequest.update({ where: { id: input.requestId }, data: { nextFollowUpAt: input.dueAt } });
  await audit({ id: user.id, label: user.name }, 'task.created', 'Task', t.id, { requestId: input.requestId });
  return t;
}

export async function completeTask(user: Principal, taskId: string, done = true) {
  assertCan(user, 'task.manage');
  const t = await db.task.findUnique({ where: { id: taskId } });
  if (!t) throw notFound('Follow-up not found.');
  if (t.requestId) await loadScoped(user, t.requestId);
  await db.task.update({ where: { id: taskId }, data: { status: done ? 'DONE' : 'OPEN', completedAt: done ? new Date() : null } });
  await audit({ id: user.id, label: user.name }, done ? 'task.completed' : 'task.reopened', 'Task', taskId);
}

// ─── Documents ─────────────────────────────────────────────────────

export async function attachDocuments(user: Principal, requestId: string, files: File[], visibility: 'INTERNAL' | 'CUSTOMER') {
  assertCan(user, 'request.note');
  const req = await loadScoped(user, requestId);
  const list = files.filter((f) => f.size > 0);
  if (!list.length) throw invalid('Choose a file to upload.');
  if (list.length > MAX_FILES_PER_UPLOAD) throw invalid(`Attach at most ${MAX_FILES_PER_UPLOAD} files.`);
  const stored: StoredFile[] = [];
  try {
    for (const f of list) stored.push(await saveUpload(f));
    await db.$transaction(async (tx) => {
      for (const s of stored) {
        await tx.document.create({ data: { ...s, visibility, requestId, companyId: req.companyId, uploadedById: user.id, uploadedByLabel: user.name } });
      }
      await audit({ id: user.id, label: user.name }, 'document.uploaded', 'QuoteRequest', requestId, { count: stored.length, visibility }, null, tx);
    });
  } catch (e) {
    await Promise.all(stored.map((s) => deleteStored(s.storageKey)));
    throw e;
  }
}

// ─── Customer (portal) views ───────────────────────────────────────

export async function listCustomerRequests(userId: string) {
  return db.quoteRequest.findMany({
    where: customerRequestScope(userId),
    orderBy: { submittedAt: 'desc' },
    include: { service: { select: { name: true } }, infoRequests: { where: { status: 'OPEN' }, select: { id: true } }, quotations: { select: { status: true } } },
  });
}

/** Everything a customer may see about their own request — never internal notes or staff-only documents. */
export async function getCustomerRequest(userId: string, id: string) {
  const req = await db.quoteRequest.findFirst({
    where: { AND: [{ id }, customerRequestScope(userId)] },
    include: {
      service: { select: { name: true, slug: true } },
      items: { orderBy: { sortOrder: 'asc' } },
      history: { orderBy: { createdAt: 'desc' }, select: { id: true, toStatus: true, createdAt: true, actorLabel: true } },
      communications: { where: { customerVisible: true }, orderBy: { occurredAt: 'desc' } },
      infoRequests: { orderBy: { createdAt: 'desc' } },
      documents: { where: { visibility: 'CUSTOMER' }, orderBy: { createdAt: 'desc' } },
      quotations: {
        orderBy: { createdAt: 'desc' },
        include: { revisions: { where: { status: { in: ['ISSUED', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN', 'SUPERSEDED'] } }, orderBy: { version: 'desc' }, select: { id: true, version: true, status: true, total: true, currency: true, issuedAt: true, validUntil: true } } },
      },
    },
  });
  if (!req) throw notFound('Request not found.');
  return req;
}

export function describeDetails(req: { details: unknown; detailLabels: unknown }) {
  const details = (req.details ?? {}) as Record<string, unknown>;
  const labels = (req.detailLabels ?? {}) as Record<string, { label: string; type: string; unit: string | null; section: string }>;
  return Object.entries(labels)
    .filter(([k]) => details[k] !== undefined && details[k] !== '')
    .map(([k, l]) => ({ key: k, label: l.label, section: l.section, value: displayValue(l, details[k]) }));
}

/** Prefill data for "repeat this request". Only the submitter's own requests qualify. */
export async function getRepeatPrefill(userId: string, id: string) {
  const req = await db.quoteRequest.findFirst({ where: { AND: [{ id }, customerRequestScope(userId)] }, select: { id: true, serviceId: true, details: true, recurrence: true } });
  if (!req) throw notFound('Request not found.');
  return req;
}
