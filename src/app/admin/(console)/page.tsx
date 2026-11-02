import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { can } from '@/lib/permissions';
import { dashboard, parseRange, METRIC_DEFINITIONS } from '@/server/reports';
import { PageHeader, Stat, StatusBadge } from '@/components/ui';
import { Bars } from '@/components/Bars';
import { db } from '@/server/db';
import { fmtDate, fmtDateTime, fmtRelativeDays } from '@/lib/format';
import { listRequests } from '@/server/requests';
import { STATUS_LABELS } from '@/lib/workflow';
import { staffRequestScope } from '@/server/rbac';
import { listArticlesAdmin } from '@/server/journal';
import { socialSummary } from '@/server/social';
import type { Role } from '@/generated/prisma/enums';

export const metadata = { title: 'Dashboard' };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  if (!can(user.role, 'report.view')) return <MyWork userId={user.id} role={user.role} name={user.name} />;
  const range = parseRange(sp.from, sp.to, 30);
  const d = await dashboard(user, range);
  const c = d.counts;
  const pctText = (p: { value: number | null; num: number; den: number; reliable: boolean }) => (p.reliable && p.value !== null ? `${p.value}%` : '—');
  const pctNote = (p: { num: number; den: number; reliable: boolean }) => (p.reliable ? `${p.num} of ${p.den}` : `Not enough data yet (${p.den} so far; shown from 5)`);
  return (
    <>
      <PageHeader title="Dashboard" eyebrow="Operations overview">
        <p>Counts marked “now” are live. The rest cover {fmtDate(range.from)} to {fmtDate(range.to)}.</p>
      </PageHeader>
      <form className="panel panel-pad mb-6 flex flex-wrap items-end gap-4" method="get">
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" className="input" defaultValue={range.fromStr} /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" className="input" defaultValue={range.toStr} /></div>
        <button className="btn btn-dark">Apply</button>
      </form>

      <section aria-label="Needs attention" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-4">
        <Link href="/admin/requests?status=RECEIVED&assigneeId=unassigned" className="no-underline !text-charcoal"><Stat label="New and unassigned (now)" value={c.newUnassigned} tone={c.newUnassigned ? 'warn' : undefined} /></Link>
        <Link href="/admin/requests?status=MORE_INFO_REQUIRED" className="no-underline !text-charcoal"><Stat label="Awaiting customer info (now)" value={c.awaitingInfo} /></Link>
        <Link href="/admin/tasks?filter=overdue" className="no-underline !text-charcoal"><Stat label="Overdue follow-ups (now)" value={c.overdue} tone={c.overdue ? 'bad' : undefined} /></Link>
        <Link href="/admin/quotations?status=ISSUED" className="no-underline !text-charcoal"><Stat label="Quotations awaiting decision (now)" value={c.issued} /></Link>
      </section>
      <section aria-label="Pipeline" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-8">
        <Stat label="Enquiries received" value={c.total} />
        <Stat label="Quotation in preparation (now)" value={c.inPrep} />
        <Stat label="In progress (now)" value={c.inProgress} />
        <Stat label="Completed in range" value={c.completed} note={`${c.cancelledDeclined} cancelled or declined`} />
      </section>
      <section aria-label="Rates" className="grid gap-4 sm:grid-cols-3 mb-8">
        <Stat label="Quotation acceptance" value={pctText(d.acceptance)} note={pctNote(d.acceptance)} />
        <Stat label="Enquiry → quotation issued" value={pctText(d.quoteConversion)} note={pctNote(d.quoteConversion)} />
        <Stat label="Enquiry → completed" value={pctText(d.completionConversion)} note={pctNote(d.completionConversion)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel panel-pad"><h2 className="!text-lg mb-4">Requests by status</h2><Bars rows={d.byStatus.map((s) => ({ label: s.label, value: s.count }))} /></section>
        <section className="panel panel-pad"><h2 className="!text-lg mb-4">Requests by service</h2><Bars rows={d.byService.map((s) => ({ label: s.label, value: s.count }))} /></section>
        <section className="panel panel-pad lg:col-span-2">
          <h2 className="!text-lg mb-4">Recent activity</h2>
          {d.recent.length === 0 ? <p className="text-steel text-sm">Nothing yet.</p> : (
            <ul className="divide-y divide-line">
              {d.recent.map((h) => (
                <li key={h.id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <Link href={`/admin/requests/${h.request.id}`} className="mono font-medium">{h.request.reference}</Link>
                  <span>{h.fromStatus ? `${STATUS_LABELS[h.fromStatus]} → ` : ''}<strong>{STATUS_LABELS[h.toStatus]}</strong></span>
                  <span className="text-steel">{h.actorLabel}</span>
                  <span className="text-steel ml-auto mono text-xs">{fmtDateTime(h.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <details className="mt-8 text-sm"><summary className="cursor-pointer font-medium">How these numbers are defined</summary>
        <dl className="mt-3 grid gap-2 max-w-3xl">{Object.entries(METRIC_DEFINITIONS).map(([k, v]) => <div key={k}><dt className="font-medium">{k}</dt><dd className="text-steel">{v}</dd></div>)}</dl>
      </details>
    </>
  );
}

async function MyWork({ userId, name, role }: { userId: string; role: Role; name: string }) {
  const user = { id: userId, name, email: '', role };
  const handlesRequests = can(role, 'request.view.assigned');
  const writes = can(role, 'journal.write');
  const [reqs, tasks, articles, social] = await Promise.all([
    handlesRequests ? listRequests(user, { status: 'OPEN', pageSize: 10 }) : Promise.resolve(null),
    handlesRequests ? db.task.findMany({ where: { status: 'OPEN', OR: [{ assigneeId: userId }, { request: staffRequestScope(user) }] }, orderBy: { dueAt: 'asc' }, take: 10, include: { request: { select: { id: true, reference: true } } } }) : Promise.resolve([]),
    writes ? listArticlesAdmin(user, {}) : Promise.resolve([]),
    can(role, 'social.publish') ? socialSummary() : Promise.resolve({} as Record<string, number>),
  ]);
  const attention = (social.NEEDS_MANUAL ?? 0) + (social.FAILED ?? 0);
  return (
    <>
      <PageHeader title="My work" eyebrow={`Hello, ${name.split(' ')[0]}`} actions={writes ? <Link href="/admin/journal/new" className="btn btn-primary !min-h-[3rem]">Write an article</Link> : undefined}><p>{handlesRequests ? 'Requests assigned to you and your open follow-ups.' : 'Your articles and publishing queue.'}</p></PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        {writes && (
          <section className="panel panel-pad"><h2 className="!text-lg mb-3">Recent articles</h2>
            {articles.length === 0 ? <p className="text-steel text-sm">No articles yet. Tap “Write an article” to begin.</p> : <ul className="divide-y divide-line">{articles.slice(0, 6).map((a) => <li key={a.id} className="py-2.5 text-sm flex items-center justify-between gap-3"><Link href={`/admin/journal/${a.id}`} className="font-medium">{a.title}</Link><span className="text-steel shrink-0">{a.status === 'PUBLISHED' ? 'Published' : a.status === 'SCHEDULED' ? 'Scheduled' : a.status === 'ARCHIVED' ? 'Removed' : 'Draft'}</span></li>)}</ul>}
            {attention > 0 && <p className="mt-3 text-sm"><Link href="/admin/journal/social">{attention} social {attention === 1 ? 'post needs' : 'posts need'} attention</Link></p>}
          </section>
        )}
        {reqs && (
          <section className="panel panel-pad"><h2 className="!text-lg mb-3">Assigned requests ({reqs.total})</h2>
            {reqs.items.length === 0 ? <p className="text-steel text-sm">Nothing assigned to you.</p> : <ul className="divide-y divide-line">{reqs.items.map((r) => <li key={r.id} className="py-2.5 flex items-center justify-between gap-3"><span><Link href={`/admin/requests/${r.id}`} className="mono font-medium">{r.reference}</Link><span className="block text-sm text-steel">{r.summary}</span></span><StatusBadge status={r.status} /></li>)}</ul>}
          </section>
        )}
        {handlesRequests && (
          <section className="panel panel-pad"><h2 className="!text-lg mb-3">Follow-ups</h2>
            {tasks.length === 0 ? <p className="text-steel text-sm">No open follow-ups.</p> : <ul className="divide-y divide-line">{tasks.map((t) => <li key={t.id} className="py-2.5 text-sm"><span className="font-medium">{t.title}</span><span className="block text-steel">Due {fmtDate(t.dueAt)} ({fmtRelativeDays(t.dueAt)}){t.request ? <> · <Link href={`/admin/requests/${t.request.id}`}>{t.request.reference}</Link></> : null}</span></li>)}</ul>}
          </section>
        )}
      </div>
    </>
  );
}
