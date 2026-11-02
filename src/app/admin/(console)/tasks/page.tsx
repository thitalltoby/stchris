import Link from 'next/link';
import { requireStaff, staffRequestScope } from '@/server/rbac';
import { db } from '@/server/db';
import { PageHeader, Empty, Badge } from '@/components/ui';
import { ActionButton } from '@/components/ActionForm';
import { fmtDate, fmtRelativeDays } from '@/lib/format';
import { can } from '@/lib/permissions';
import { completeTaskAction } from '../requests/actions';

export const metadata = { title: 'Follow-ups' };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireStaff('task.manage');
  const { filter = 'open' } = await searchParams;
  const scope = staffRequestScope(user);
  const mineOnly = !can(user.role, 'request.view.all');
  const where = {
    AND: [
      filter === 'done' ? { status: 'DONE' as const } : { status: 'OPEN' as const },
      filter === 'overdue' ? { dueAt: { lt: new Date() } } : {},
      mineOnly ? { OR: [{ assigneeId: user.id }, { request: scope }] } : {},
      filter === 'mine' ? { assigneeId: user.id } : {},
    ],
  };
  const tasks = await db.task.findMany({ where, orderBy: filter === 'done' ? { completedAt: 'desc' } : { dueAt: 'asc' }, take: 200, include: { request: { select: { id: true, reference: true } }, company: { select: { id: true, name: true } }, assignee: { select: { name: true } } } });
  const tabs = [['open', 'Open'], ['overdue', 'Overdue'], ['mine', 'Mine'], ['done', 'Done']];
  return (
    <>
      <PageHeader title="Follow-ups" eyebrow="Tasks and reminders" />
      <nav aria-label="Filter" className="flex gap-2 mb-5 flex-wrap">{tabs.map(([k, l]) => <Link key={k} href={`/admin/tasks?filter=${k}`} aria-current={filter === k ? 'page' : undefined} className={`btn btn-sm ${filter === k ? 'btn-dark' : 'btn-outline'}`}>{l}</Link>)}</nav>
      {tasks.length === 0 ? <Empty title="Nothing here" /> : (
        <div className="table-wrap"><table className="dt"><caption className="sr-only">Follow-ups</caption><thead><tr><th>Task</th><th>Related to</th><th>Owner</th><th>Due</th><th><span className="sr-only">Action</span></th></tr></thead>
          <tbody>{tasks.map((t) => { const overdue = t.status === 'OPEN' && t.dueAt < new Date(); return (
            <tr key={t.id}><td><span className="font-medium">{t.title}</span>{t.origin === 'AUTO' && <span className="text-steel text-xs"> (automatic)</span>}</td>
              <td>{t.request ? <Link href={`/admin/requests/${t.request.id}`} className="mono">{t.request.reference}</Link> : t.company ? <Link href={`/admin/customers/${t.company.id}`}>{t.company.name}</Link> : '—'}</td>
              <td>{t.assignee?.name ?? '—'}</td><td className="whitespace-nowrap">{fmtDate(t.dueAt)} {overdue ? <Badge tone="bad">Overdue</Badge> : t.status === 'OPEN' ? <span className="text-steel text-xs">({fmtRelativeDays(t.dueAt)})</span> : null}</td>
              <td><ActionButton action={completeTaskAction} hidden={{ taskId: t.id, done: t.status === 'OPEN' ? 'true' : 'false' }}>{t.status === 'OPEN' ? 'Mark done' : 'Reopen'}</ActionButton></td></tr>); })}</tbody></table></div>
      )}
    </>
  );
}
