import { requireStaff } from '@/server/rbac';
import { db } from '@/server/db';
import { PageHeader, Badge, Pagination, qs } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { activeMailProvider } from '@/server/mail';

export const metadata = { title: 'Email outbox' };

const TONE = { SENT: 'good', SKIPPED: 'warn', FAILED: 'bad', QUEUED: 'info' } as const;

export default async function Outbox({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requireStaff('settings.manage');
  const provider = await activeMailProvider();
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const where = sp.status && ['QUEUED', 'SENT', 'FAILED', 'SKIPPED'].includes(sp.status) ? { status: sp.status as 'QUEUED' } : {};
  const [total, rows, counts] = await Promise.all([
    db.notificationEvent.count({ where }),
    db.notificationEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 30, take: 30, select: { id: true, type: true, toAddress: true, subject: true, status: true, provider: true, error: true, attempts: true, createdAt: true, sentAt: true } }),
    db.notificationEvent.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  return (
    <>
      <PageHeader title="Email outbox" eyebrow="Delivery record"><p>Every email the system tries to send. Message bodies are deliberately not shown here because they can contain one-time links. Provider: <strong>{provider.name}{provider.source === 'console' ? ' (set in Integrations)' : provider.source === 'server' ? ' (server settings)' : ''}</strong>.</p></PageHeader>
      <div className="flex flex-wrap gap-2 mb-5">{[['', 'All'], ['QUEUED', 'Queued'], ['SENT', 'Sent'], ['SKIPPED', 'Skipped'], ['FAILED', 'Failed']].map(([k, l]) => <a key={k} href={`/admin/notifications${qs({ status: k })}`} className={`btn btn-sm ${(sp.status ?? '') === k ? 'btn-dark' : 'btn-outline'}`}>{l}{k ? ` (${counts.find((c) => c.status === k)?._count._all ?? 0})` : ''}</a>)}</div>
      <div className="table-wrap"><table className="dt"><caption className="sr-only">Outbox</caption><thead><tr><th>Created</th><th>Type</th><th>To</th><th>Subject</th><th>Status</th></tr></thead>
        <tbody>{rows.map((n) => <tr key={n.id}><td className="mono text-xs whitespace-nowrap">{fmtDateTime(n.createdAt)}</td><td className="mono text-xs">{n.type}</td><td>{n.toAddress}</td><td className="max-w-xs truncate" title={n.subject}>{n.subject}</td><td><Badge tone={TONE[n.status as keyof typeof TONE]}>{n.status}</Badge>{n.error && <span className="block text-xs text-steel mt-1 max-w-xs">{n.error}</span>}</td></tr>)}</tbody></table></div>
      <Pagination page={page} pages={Math.max(Math.ceil(total / 30), 1)} hrefFor={(p) => `/admin/notifications${qs({ status: sp.status, page: p })}`} />
    </>
  );
}
