import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import type { RequestStatus } from '@/generated/prisma/enums';
import { db } from './db';
import { assertCan, staffRequestScope, type Principal } from './rbac';
import { OPEN_FILTER } from './requests';
import { STATUS_LABELS } from '@/lib/workflow';

export interface DateRange {
  from: Date;
  to: Date;
  fromStr: string;
  toStr: string;
}

export function parseRange(from?: string, to?: string, defaultDays = 90): DateRange {
  const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined);
  const toStr = ok(to) ?? new Date().toISOString().slice(0, 10);
  const fromStr = ok(from) ?? new Date(Date.now() - defaultDays * 86_400_000).toISOString().slice(0, 10);
  return { from: new Date(`${fromStr}T00:00:00.000Z`), to: new Date(`${toStr}T23:59:59.999Z`), fromStr, toStr };
}

/** A conversion-style percentage is only shown with enough data behind it. */
export const MIN_SAMPLE = 5;
export const pct = (num: number, den: number): { value: number | null; num: number; den: number; reliable: boolean } => ({
  value: den > 0 ? Math.round((num / den) * 1000) / 10 : null,
  num,
  den,
  reliable: den >= MIN_SAMPLE,
});

export const METRIC_DEFINITIONS: Record<string, string> = {
  totalEnquiries: 'Requests with a submission date inside the selected range.',
  newUnassigned: 'Requests currently in “Received” with nobody assigned (not limited by the date range).',
  awaitingInfo: 'Requests currently waiting for information from the customer.',
  inPreparation: 'Requests currently in “Quotation in preparation”.',
  issued: 'Quotations currently issued or viewed and awaiting the customer’s decision.',
  inProgress: 'Requests currently in progress.',
  completed: 'Requests completed inside the selected range (by completion date).',
  cancelledDeclined: 'Requests cancelled or declined that were submitted inside the selected range.',
  overdue: 'Open follow-ups whose due date has passed.',
  acceptance: 'Accepted ÷ (accepted + declined + expired) quotation revisions that reached an outcome, issued inside the range. Shown only with at least 5 outcomes.',
  quoteConversion: 'Requests submitted in the range that have at least one issued quotation ÷ all requests submitted in the range.',
  completionConversion: 'Requests submitted in the range that are now completed ÷ all requests submitted in the range. Recent requests may still be open, so this understates the final rate.',
  stageTime: 'Average time between entering a status and leaving it, from status history. Statuses a request is still in are not counted.',
};

export async function dashboard(user: Principal, range: DateRange) {
  assertCan(user, 'report.view');
  const scope = staffRequestScope(user);
  const inRange = { AND: [scope, { submittedAt: { gte: range.from, lte: range.to } }] } satisfies Prisma.QuoteRequestWhereInput;
  const now = new Date();
  const [total, newUnassigned, awaitingInfo, inPrep, issued, inProgress, completed, cancelledDeclined, overdue, byStatus, byService, recent, withIssuedQuote, completedInCohort, outcomes] = await Promise.all([
    db.quoteRequest.count({ where: inRange }),
    db.quoteRequest.count({ where: { AND: [scope, { status: 'RECEIVED', assigneeId: null }] } }),
    db.quoteRequest.count({ where: { AND: [scope, { status: 'MORE_INFO_REQUIRED' }] } }),
    db.quoteRequest.count({ where: { AND: [scope, { status: 'QUOTATION_IN_PREPARATION' }] } }),
    db.quotation.count({ where: { request: scope, status: { in: ['ISSUED', 'VIEWED'] } } }),
    db.quoteRequest.count({ where: { AND: [scope, { status: 'IN_PROGRESS' }] } }),
    db.quoteRequest.count({ where: { AND: [scope, { status: 'COMPLETED', completedAt: { gte: range.from, lte: range.to } }] } }),
    db.quoteRequest.count({ where: { AND: [scope, { submittedAt: { gte: range.from, lte: range.to } }, { status: { in: ['CANCELLED', 'DECLINED'] } }] } }),
    db.task.count({ where: { status: 'OPEN', dueAt: { lt: now }, ...(Object.keys(scope).length ? { request: scope } : {}) } }),
    db.quoteRequest.groupBy({ by: ['status'], where: inRange, _count: { _all: true } }),
    db.quoteRequest.groupBy({ by: ['serviceId'], where: inRange, _count: { _all: true } }),
    db.statusHistory.findMany({ where: { request: scope }, orderBy: { createdAt: 'desc' }, take: 8, include: { request: { select: { id: true, reference: true } } } }),
    db.quoteRequest.count({ where: { AND: [inRange], quotations: { some: { revisions: { some: { issuedAt: { not: null } } } } } } }),
    db.quoteRequest.count({ where: { AND: [inRange, { status: 'COMPLETED' }] } }),
    db.quotationRevision.groupBy({ by: ['status'], where: { status: { in: ['ACCEPTED', 'DECLINED', 'EXPIRED'] }, issuedAt: { gte: range.from, lte: range.to }, quotation: { request: scope } }, _count: { _all: true } }),
  ]);
  const services = await db.service.findMany({ select: { id: true, name: true } });
  const nameOf = new Map(services.map((s) => [s.id, s.name]));
  const accepted = outcomes.find((o) => o.status === 'ACCEPTED')?._count._all ?? 0;
  const decided = outcomes.reduce((n, o) => n + o._count._all, 0);
  return {
    counts: { total, newUnassigned, awaitingInfo, inPrep, issued, inProgress, completed, cancelledDeclined, overdue },
    byStatus: byStatus.map((s) => ({ key: s.status as RequestStatus, label: STATUS_LABELS[s.status as RequestStatus], count: s._count._all })).sort((a, b) => b.count - a.count),
    byService: byService.map((s) => ({ key: s.serviceId, label: nameOf.get(s.serviceId) ?? 'Unknown', count: s._count._all })).sort((a, b) => b.count - a.count),
    recent,
    acceptance: pct(accepted, decided),
    quoteConversion: pct(withIssuedQuote, total),
    completionConversion: pct(completedInCohort, total),
  };
}

export async function reports(user: Principal, range: DateRange) {
  assertCan(user, 'report.view');
  const scope = staffRequestScope(user);
  const scoped = Object.keys(scope).length > 0; // staff limited to assigned requests only see their own numbers
  const inRange = { AND: [scope, { submittedAt: { gte: range.from, lte: range.to } }] } satisfies Prisma.QuoteRequestWhereInput;

  const [bySource, byAssignee, perDay, stageTimes, quoteStatus, quoteValue, overdue, repeat] = await Promise.all([
    db.quoteRequest.groupBy({ by: ['source'], where: inRange, _count: { _all: true } }),
    db.quoteRequest.groupBy({ by: ['assigneeId'], where: inRange, _count: { _all: true } }),
    scoped
      ? Promise.resolve([] as { day: string; count: number }[])
      : db.$queryRaw<{ day: string; count: number }[]>`
          SELECT to_char(date_trunc('day', "submittedAt" AT TIME ZONE 'Africa/Lagos'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
          FROM "QuoteRequest" WHERE "submittedAt" >= ${range.from} AND "submittedAt" <= ${range.to}
          GROUP BY 1 ORDER BY 1`,
    scoped
      ? Promise.resolve([] as { status: string; avg_hours: number; n: number }[])
      : db.$queryRaw<{ status: string; avg_hours: number; n: number }[]>`
          SELECT "toStatus"::text AS status,
                 ROUND((AVG(EXTRACT(EPOCH FROM (next_at - "createdAt")) / 3600))::numeric, 1)::float AS avg_hours,
                 COUNT(*)::int AS n
          FROM (SELECT h."toStatus", h."createdAt", LEAD(h."createdAt") OVER (PARTITION BY h."requestId" ORDER BY h."createdAt") AS next_at
                FROM "StatusHistory" h JOIN "QuoteRequest" r ON r.id = h."requestId"
                WHERE r."submittedAt" >= ${range.from} AND r."submittedAt" <= ${range.to}) t
          WHERE next_at IS NOT NULL GROUP BY "toStatus"`,
    db.quotation.groupBy({ by: ['status'], where: { request: inRange }, _count: { _all: true } }),
    db.$queryRaw<{ status: string; currency: string; total: string; n: number }[]>`
      SELECT r."status"::text AS status, r."currency", SUM(r."total")::text AS total, COUNT(*)::int AS n
      FROM "QuotationRevision" r
      WHERE r."version" = (SELECT MAX(x."version") FROM "QuotationRevision" x WHERE x."quotationId" = r."quotationId")
        AND r."quotationId" IN (SELECT q.id FROM "Quotation" q JOIN "QuoteRequest" lr ON lr.id = q."requestId" WHERE lr."submittedAt" >= ${range.from} AND lr."submittedAt" <= ${range.to})
      GROUP BY r."status", r."currency"`,
    db.task.findMany({ where: { status: 'OPEN', dueAt: { lt: new Date() }, ...(scoped ? { request: scope } : {}) }, orderBy: { dueAt: 'asc' }, take: 50, include: { request: { select: { id: true, reference: true } }, assignee: { select: { name: true } } } }),
    db.quoteRequest.groupBy({ by: ['requesterEmail'], where: { AND: [scope] }, having: { requesterEmail: { _count: { gt: 1 } } }, _count: { _all: true }, orderBy: { _count: { requesterEmail: 'desc' } }, take: 20 }),
  ]);
  const staff = await db.user.findMany({ where: { role: { not: 'CUSTOMER' } }, select: { id: true, name: true } });
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  return {
    bySource: bySource.map((s) => ({ label: s.source ?? 'unknown', count: s._count._all })).sort((a, b) => b.count - a.count),
    byAssignee: byAssignee.map((s) => ({ label: s.assigneeId ? staffName.get(s.assigneeId) ?? 'Former user' : 'Unassigned', count: s._count._all })).sort((a, b) => b.count - a.count),
    perDay,
    stageTimes: stageTimes.map((s) => ({ label: STATUS_LABELS[s.status as RequestStatus] ?? s.status, hours: s.avg_hours, n: s.n })),
    quoteStatus: quoteStatus.map((s) => ({ label: s.status, count: s._count._all })),
    quoteValue,
    overdue,
    repeat,
    scoped,
  };
}

export async function requestsCsv(user: Principal, range: DateRange): Promise<string> {
  assertCan(user, 'report.view');
  const rows = await db.quoteRequest.findMany({
    where: { AND: [staffRequestScope(user), { submittedAt: { gte: range.from, lte: range.to } }] },
    orderBy: { submittedAt: 'desc' },
    take: 5000,
    include: { service: { select: { name: true } }, assignee: { select: { name: true } } },
  });
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = ['Reference', 'Submitted', 'Service', 'Status', 'Requester', 'Email', 'Company', 'Assigned to', 'Origin', 'Destination', 'Summary', 'Source'];
  const lines = rows.map((r) => [r.reference, r.submittedAt.toISOString(), r.service.name, STATUS_LABELS[r.status], r.requesterName, r.requesterEmail, r.companyName, r.assignee?.name, r.origin, r.destination, r.summary, r.source].map(esc).join(','));
  return [head.map(esc).join(','), ...lines].join('\r\n');
}

export { OPEN_FILTER };
