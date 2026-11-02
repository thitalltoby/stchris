import Link from 'next/link';
import { requireCustomer } from '@/server/rbac';
import { listCustomerRequests } from '@/server/requests';
import { PageHeader, StatusBadge, Empty } from '@/components/ui';
import { fmtDate } from '@/lib/format';

export const metadata = { title: 'My requests' };

export default async function PortalRequests() {
  const user = await requireCustomer();
  const reqs = await listCustomerRequests(user.id);
  return (
    <>
      <PageHeader title="My requests" actions={<Link href="/request" className="btn btn-primary">New request</Link>} />
      {reqs.length === 0 ? <Empty title="No requests yet" /> : (
        <div className="table-wrap"><table className="dt"><caption className="sr-only">Your requests</caption><thead><tr><th>Reference</th><th>Service</th><th>Submitted</th><th>Status</th></tr></thead>
          <tbody>{reqs.map((r) => <tr key={r.id}><td><Link href={`/portal/requests/${r.id}`} className="mono font-medium">{r.reference}</Link></td><td>{r.service.name}<span className="block text-xs text-steel">{r.summary}</span></td><td className="mono text-xs whitespace-nowrap">{fmtDate(r.submittedAt)}</td><td><StatusBadge status={r.status} />{r.infoRequests.length > 0 && <span className="block text-xs text-ember font-medium mt-1">Reply needed</span>}</td></tr>)}</tbody></table></div>
      )}
    </>
  );
}
