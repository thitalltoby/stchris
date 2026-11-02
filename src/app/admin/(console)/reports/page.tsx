import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { reports, dashboard, parseRange, METRIC_DEFINITIONS, MIN_SAMPLE } from '@/server/reports';
import { PageHeader } from '@/components/ui';
import { Bars } from '@/components/Bars';
import { formatMoney } from '@/lib/money';
import { fmtDate, fmtRelativeDays } from '@/lib/format';
import { QUOTATION_STATUS_LABELS } from '@/lib/quotation-labels';
import type { QuotationStatus } from '@/generated/prisma/enums';

export const metadata = { title: 'Reports' };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requireStaff('report.view');
  const sp = await searchParams;
  const range = parseRange(sp.from, sp.to, 90);
  const [r, d] = await Promise.all([reports(user, range), dashboard(user, range)]);
  const csv = `/admin/reports/export?from=${range.fromStr}&to=${range.toStr}`;
  return (
    <>
      <PageHeader title="Reports" eyebrow="Operations and commercial" actions={<a className="btn btn-outline" href={csv}>Export requests (CSV)</a>}>
        <p>{fmtDate(range.from)} to {fmtDate(range.to)}. {r.scoped && 'You see only the requests assigned to you.'}</p>
      </PageHeader>
      <form className="panel panel-pad mb-6 flex flex-wrap items-end gap-4" method="get">
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" className="input" defaultValue={range.fromStr} /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" className="input" defaultValue={range.toStr} /></div>
        <button className="btn btn-dark">Apply</button>
      </form>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel panel-pad"><h2 className="!text-lg mb-4">Requests by service</h2><Bars rows={d.byService.map((s) => ({ label: s.label, value: s.count }))} /></section>
        <section className="panel panel-pad"><h2 className="!text-lg mb-4">Requests by status</h2><Bars rows={d.byStatus.map((s) => ({ label: s.label, value: s.count }))} /></section>
        <section className="panel panel-pad"><h2 className="!text-lg mb-4">By source</h2><Bars rows={r.bySource.map((s) => ({ label: s.label, value: s.count }))} /></section>
        <section className="panel panel-pad"><h2 className="!text-lg mb-4">By assignee</h2><Bars rows={r.byAssignee.map((s) => ({ label: s.label, value: s.count }))} /></section>
        <section className="panel panel-pad"><h2 className="!text-lg mb-1">Average time in each stage</h2><p className="text-sm text-steel mb-4">Hours between entering a status and leaving it. Statuses still open are not counted.</p>
          {r.scoped ? <p className="text-sm text-steel">Available to staff who can see all requests.</p> : <Bars unit=" h" rows={r.stageTimes.map((s) => ({ label: s.label, value: s.hours, note: `(n=${s.n})` }))} />}</section>
        <section className="panel panel-pad"><h2 className="!text-lg mb-1">Quotation pipeline</h2><p className="text-sm text-steel mb-4">Latest revision per quotation, for requests submitted in range.</p>
          {r.quoteValue.length === 0 ? <p className="text-sm text-steel">No quotations in this range.</p> : <div className="table-wrap"><table className="dt"><thead><tr><th>Status</th><th className="num">Count</th><th className="num">Value</th></tr></thead><tbody>{r.quoteValue.map((q) => <tr key={`${q.status}${q.currency}`}><td>{QUOTATION_STATUS_LABELS[q.status as QuotationStatus] ?? q.status}</td><td className="num">{q.n}</td><td className="num">{formatMoney(q.total, q.currency)}</td></tr>)}</tbody></table></div>}</section>
        <section className="panel panel-pad lg:col-span-2"><h2 className="!text-lg mb-4">Requests per day</h2>
          {r.scoped ? <p className="text-sm text-steel">Available to staff who can see all requests.</p> : r.perDay.length === 0 ? <p className="text-sm text-steel">No requests in this range.</p> : <Bars rows={r.perDay.slice(-31).map((p) => ({ label: p.day, value: p.count }))} />}
          {r.perDay.length > 31 && <p className="hint mt-2">Showing the latest 31 days with requests.</p>}</section>
        <section className="panel panel-pad"><h2 className="!text-lg mb-3">Rates</h2>
          <dl className="space-y-3 text-sm">{([['Quotation acceptance', d.acceptance], ['Enquiry → quotation issued', d.quoteConversion], ['Enquiry → completed', d.completionConversion]] as const).map(([l, p]) => <div key={l}><dt className="font-medium">{l}</dt><dd className="text-steel">{p.reliable && p.value !== null ? <span className="mono text-charcoal text-lg">{p.value}%</span> : <span>Not shown: only {p.den} cases (minimum {MIN_SAMPLE})</span>} <span className="mono">{p.reliable ? `(${p.num} of ${p.den})` : ''}</span></dd></div>)}</dl></section>
        <section className="panel panel-pad"><h2 className="!text-lg mb-3">Overdue follow-ups ({r.overdue.length})</h2>
          {r.overdue.length === 0 ? <p className="text-sm text-steel">None.</p> : <ul className="divide-y divide-line text-sm">{r.overdue.slice(0, 12).map((t) => <li key={t.id} className="py-2"><strong>{t.title}</strong><span className="block text-steel">{t.request ? <Link href={`/admin/requests/${t.request.id}`}>{t.request.reference}</Link> : null} due {fmtDate(t.dueAt)} ({fmtRelativeDays(t.dueAt)}){t.assignee ? ` · ${t.assignee.name}` : ''}</span></li>)}</ul>}</section>
        {!r.scoped && <section className="panel panel-pad lg:col-span-2"><h2 className="!text-lg mb-3">Repeat requesters</h2>{r.repeat.length === 0 ? <p className="text-sm text-steel">No email address has sent more than one request.</p> : <Bars rows={r.repeat.map((x) => ({ label: x.requesterEmail, value: x._count._all }))} />}</section>}
      </div>
      <details className="mt-8 text-sm"><summary className="cursor-pointer font-medium">How these numbers are defined</summary><dl className="mt-3 grid gap-2 max-w-3xl">{Object.entries(METRIC_DEFINITIONS).map(([k, v]) => <div key={k}><dt className="font-medium">{k}</dt><dd className="text-steel">{v}</dd></div>)}</dl></details>
    </>
  );
}
