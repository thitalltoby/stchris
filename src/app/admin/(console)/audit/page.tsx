import { requireStaff } from '@/server/rbac';
import { db } from '@/server/db';
import { PageHeader, Pagination, qs } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';

export const metadata = { title: 'Audit log' };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireStaff('audit.view');
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const where = sp.q?.trim() ? { OR: [{ action: { contains: sp.q.trim(), mode: 'insensitive' as const } }, { actorLabel: { contains: sp.q.trim(), mode: 'insensitive' as const } }, { entityType: { contains: sp.q.trim(), mode: 'insensitive' as const } }, { entityId: sp.q.trim() }] } : {};
  const [total, rows] = await Promise.all([db.auditEvent.count({ where }), db.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 40, take: 40 })]);
  return (
    <>
      <PageHeader title="Audit log" eyebrow={`${total.toLocaleString('en-GB')} events`}><p>Who did what and when. Append-only: nothing in the console can edit or delete these records.</p></PageHeader>
      <form className="panel panel-pad mb-5 flex gap-4 items-end" method="get"><div className="grow max-w-md"><label className="label" htmlFor="q">Filter</label><input id="q" name="q" className="input" defaultValue={sp.q} placeholder="Action, person or record id" /></div><button className="btn btn-dark">Filter</button></form>
      <div className="table-wrap"><table className="dt"><caption className="sr-only">Audit events</caption><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
        <tbody>{rows.map((a) => <tr key={a.id}><td className="mono text-xs whitespace-nowrap">{fmtDateTime(a.createdAt)}</td><td>{a.actorLabel}</td><td className="mono text-xs">{a.action}</td><td className="mono text-xs">{a.entityType}{a.entityId ? <span className="block text-steel">{a.entityId.slice(0, 12)}</span> : null}</td><td className="mono text-xs max-w-xs truncate" title={a.meta ? JSON.stringify(a.meta) : ''}>{a.meta ? JSON.stringify(a.meta) : ''}</td></tr>)}</tbody></table></div>
      <Pagination page={page} pages={Math.max(Math.ceil(total / 40), 1)} hrefFor={(p) => `/admin/audit${qs({ q: sp.q, page: p })}`} />
    </>
  );
}
