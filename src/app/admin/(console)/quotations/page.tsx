import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { listQuotations } from '@/server/quotations';
import { QUOTATION_STATUS_LABELS } from '@/lib/quotation-labels';
import { PageHeader, QuotationBadge, Pagination, Empty, qs } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import type { QuotationStatus } from '@/generated/prisma/enums';

export const metadata = { title: 'Quotations' };

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const user = await requireStaff('quotation.view');
  const sp = await searchParams;
  const data = await listQuotations(user, { q: sp.q, status: (sp.status as QuotationStatus) || undefined, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="Quotations" eyebrow={`${data.total} total`} />
      <form className="panel panel-pad mb-5 flex flex-wrap gap-4 items-end" method="get">
        <div className="grow max-w-sm"><label className="label" htmlFor="q">Search</label><input id="q" name="q" className="input" defaultValue={sp.q} placeholder="Number, reference, customer…" /></div>
        <div><label className="label" htmlFor="status">Status</label><select id="status" name="status" className="select" defaultValue={sp.status ?? ''}><option value="">All</option>{(Object.keys(QUOTATION_STATUS_LABELS) as QuotationStatus[]).map((s) => <option key={s} value={s}>{QUOTATION_STATUS_LABELS[s]}</option>)}</select></div>
        <button className="btn btn-dark">Filter</button>
      </form>
      {data.items.length === 0 ? <Empty title="No quotations">Create one from a request.</Empty> : (
        <div className="table-wrap"><table className="dt"><caption className="sr-only">Quotations</caption>
          <thead><tr><th scope="col">Number</th><th scope="col">Request</th><th scope="col">Customer</th><th scope="col" className="num">Total</th><th scope="col">Valid until</th><th scope="col">Status</th></tr></thead>
          <tbody>{data.items.map((q) => { const rev = q.revisions[0]; return (
            <tr key={q.id}>
              <td><Link href={`/admin/quotations/${q.id}`} className="mono font-medium">{q.number}</Link>{rev && <span className="text-steel mono text-xs"> v{rev.version}</span>}</td>
              <td><Link href={`/admin/requests/${q.request.id}`} className="mono">{q.request.reference}</Link></td>
              <td>{q.request.requesterName}{q.request.companyName && <span className="block text-steel text-xs">{q.request.companyName}</span>}</td>
              <td className="num">{rev ? formatMoney(rev.total.toString(), rev.currency) : '—'}</td>
              <td className="mono text-xs">{rev?.validUntil ? fmtDate(rev.validUntil) : '—'}</td>
              <td><QuotationBadge status={q.status} /></td>
            </tr>); })}</tbody></table></div>
      )}
      <Pagination page={data.page} pages={data.pages} hrefFor={(p) => `/admin/quotations${qs({ q: sp.q, status: sp.status, page: p })}`} />
    </>
  );
}
