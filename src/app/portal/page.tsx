import Link from 'next/link';
import { requireCustomer } from '@/server/rbac';
import { listCustomerRequests } from '@/server/requests';
import { PageHeader, StatusBadge, Stat, Empty } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { STATUS_CUSTOMER_TEXT } from '@/lib/workflow';

export const metadata = { title: 'Overview' };

export default async function PortalHome() {
  const user = await requireCustomer();
  const reqs = await listCustomerRequests(user.id);
  const needInfo = reqs.filter((r) => r.infoRequests.length > 0);
  const toDecide = reqs.filter((r) => r.status === 'QUOTATION_ISSUED');
  const open = reqs.filter((r) => !['COMPLETED', 'DECLINED', 'CANCELLED', 'CLOSED', 'EXPIRED'].includes(r.status));
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} eyebrow="Customer portal" actions={<Link href="/request" className="btn btn-primary">New request</Link>} />
      {(needInfo.length > 0 || toDecide.length > 0) && (
        <section aria-label="Needs your attention" className="mb-8 space-y-3">
          {needInfo.map((r) => <Link key={r.id} href={`/portal/requests/${r.id}`} className="alert alert-warn block no-underline !text-[#5f420a]"><strong>We need information from you</strong> for {r.reference}. <span className="underline">Reply now</span></Link>)}
          {toDecide.map((r) => <Link key={r.id} href={`/portal/requests/${r.id}`} className="alert alert-info block no-underline !text-[#2b3a47]"><strong>A quotation is waiting for your decision</strong> on {r.reference}. <span className="underline">Review it</span></Link>)}
        </section>
      )}
      <div className="grid gap-4 sm:grid-cols-3 mb-10"><Stat label="Open requests" value={open.length} /><Stat label="Need your reply" value={needInfo.length} tone={needInfo.length ? 'warn' : undefined} /><Stat label="Quotations to decide" value={toDecide.length} tone={toDecide.length ? 'warn' : undefined} /></div>
      <h2 className="!text-xl mb-4">Recent requests</h2>
      {reqs.length === 0 ? <Empty title="No requests yet">Send your first requirement to the St. Chris team. <Link href="/request">Start a request</Link></Empty> : (
        <ul className="grid gap-3">{reqs.slice(0, 5).map((r) => (
          <li key={r.id}><Link href={`/portal/requests/${r.id}`} className="panel panel-pad block no-underline !text-charcoal hover:border-ember transition-colors">
            <div className="flex flex-wrap justify-between gap-2 items-center"><span className="mono font-medium text-ember">{r.reference}</span><StatusBadge status={r.status} /></div>
            <p className="font-medium mt-1">{r.service.name}</p><p className="text-sm text-steel">{STATUS_CUSTOMER_TEXT[r.status]} · submitted {fmtDate(r.submittedAt)}</p></Link></li>))}</ul>
      )}
      {reqs.length > 5 && <p className="mt-4"><Link href="/portal/requests">See all {reqs.length} requests</Link></p>}
    </>
  );
}
