import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { listRequests, type RequestFilters } from '@/server/requests';
import { PageHeader, StatusBadge, Pagination, Empty, qs } from '@/components/ui';
import { db } from '@/server/db';
import { fmtDate } from '@/lib/format';
import { STATUS_LABELS } from '@/lib/workflow';
import { can } from '@/lib/permissions';
import type { RequestStatus } from '@/generated/prisma/enums';

export const metadata = { title: 'Requests' };

type SP = { q?: string; status?: string; serviceId?: string; assigneeId?: string; from?: string; to?: string; page?: string; followUpDue?: string };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireStaff();
  if (!can(user.role, 'request.view.all') && !can(user.role, 'request.view.assigned')) return null;
  const sp = await searchParams;
  const filters: RequestFilters = { q: sp.q, status: (sp.status as RequestFilters['status']) || '', serviceId: sp.serviceId, assigneeId: sp.assigneeId, from: sp.from, to: sp.to, page: Number(sp.page) || 1, followUpDue: sp.followUpDue === '1' };
  const [data, services, staff] = await Promise.all([
    listRequests(user, filters),
    db.service.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    db.user.findMany({ where: { isActive: true, role: { not: 'CUSTOMER' } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const base = { q: sp.q, status: sp.status, serviceId: sp.serviceId, assigneeId: sp.assigneeId, from: sp.from, to: sp.to, followUpDue: sp.followUpDue };
  return (
    <>
      <PageHeader title="Requests" eyebrow={`${data.total} ${data.total === 1 ? 'request' : 'requests'}`} />
      <form method="get" className="panel panel-pad mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 items-end">
        <div className="sm:col-span-2"><label className="label" htmlFor="q">Search</label><input id="q" name="q" className="input" defaultValue={sp.q} placeholder="Reference, name, email, company…" /></div>
        <div><label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="select" defaultValue={sp.status ?? ''}><option value="">All</option><option value="OPEN">All open</option>{(Object.keys(STATUS_LABELS) as RequestStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></div>
        <div><label className="label" htmlFor="serviceId">Service</label>
          <select id="serviceId" name="serviceId" className="select" defaultValue={sp.serviceId ?? ''}><option value="">All</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        {can(user.role, 'request.view.all') && <div><label className="label" htmlFor="assigneeId">Assigned to</label>
          <select id="assigneeId" name="assigneeId" className="select" defaultValue={sp.assigneeId ?? ''}><option value="">Anyone</option><option value="unassigned">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
        <div><label className="label" htmlFor="from">Submitted from</label><input id="from" type="date" name="from" className="input" defaultValue={sp.from} /></div>
        <div><label className="label" htmlFor="to">to</label><input id="to" type="date" name="to" className="input" defaultValue={sp.to} /></div>
        <label className="check sm:col-span-2"><input type="checkbox" name="followUpDue" value="1" defaultChecked={sp.followUpDue === '1'} /><span>Follow-up overdue</span></label>
        <div className="flex gap-2"><button className="btn btn-dark">Filter</button><Link href="/admin/requests" className="btn btn-outline">Clear</Link></div>
      </form>
      {data.items.length === 0 ? <Empty title="No requests match">Try clearing a filter.</Empty> : (
        <div className="table-wrap">
          <table className="dt">
            <caption className="sr-only">Requests</caption>
            <thead><tr><th scope="col">Reference</th><th scope="col">Submitted</th><th scope="col">Requester</th><th scope="col">Service and summary</th><th scope="col">Status</th><th scope="col">Assigned</th></tr></thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/admin/requests/${r.id}`} className="mono font-medium whitespace-nowrap">{r.reference}</Link></td>
                  <td className="whitespace-nowrap mono text-xs">{fmtDate(r.submittedAt)}</td>
                  <td><span className="font-medium">{r.requesterName}</span>{r.companyName && <span className="block text-steel text-xs">{r.companyName}</span>}</td>
                  <td className="max-w-md"><span className="block">{r.service.name}</span><span className="block text-steel text-xs truncate">{r.summary}</span></td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.assignee?.name ?? <span className="text-steel">Unassigned</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={data.page} pages={data.pages} hrefFor={(p) => `/admin/requests${qs({ ...base, page: p })}`} />
    </>
  );
}
