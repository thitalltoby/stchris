import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { can } from '@/lib/permissions';
import { db } from '@/server/db';
import { getSetting } from '@/server/settings';
import { readership } from '@/server/journal';
import { socialSummary } from '@/server/social';
import { PageHeader, Stat, Alert } from '@/components/ui';
import { Bars } from '@/components/Bars';

export const metadata = { title: 'Insights' };
const RANGES = [7, 30, 90] as const;
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

export default async function Insights({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requireStaff('analytics.view');
  const n = Number((await searchParams).days);
  const days = (RANGES as readonly number[]).includes(n) ? n : 30;
  const since = daysAgo(days);
  const [read, depts, byDept, byService, bySource, jr, social, perAccount, ga] = await Promise.all([
    readership(days),
    getSetting('departments'),
    can(user.role, 'request.view.assigned') || can(user.role, 'report.view') ? db.quoteRequest.groupBy({ by: ['department'], where: { createdAt: { gte: since } }, _count: true }) : Promise.resolve([]),
    can(user.role, 'report.view') ? db.quoteRequest.groupBy({ by: ['serviceId'], where: { createdAt: { gte: since } }, _count: true }) : Promise.resolve([]),
    can(user.role, 'report.view') ? db.quoteRequest.groupBy({ by: ['source'], where: { createdAt: { gte: since } }, _count: true }) : Promise.resolve([]),
    db.article.groupBy({ by: ['status'], _count: true }),
    socialSummary(),
    db.socialPost.groupBy({ by: ['accountId', 'status'], where: { createdAt: { gte: since } }, _count: true }),
    db.integration.findUnique({ where: { key: 'analytics' } }).catch(() => null),
  ]);
  const services = byService.length ? await db.service.findMany({ where: { id: { in: byService.map((b) => b.serviceId) } }, select: { id: true, name: true } }) : [];
  const accounts = await db.socialAccount.findMany({ select: { id: true, displayName: true } });
  const sum = (rows: { _count: number }[]) => rows.reduce((a, r) => a + r._count, 0);
  const jc = Object.fromEntries(jr.map((r) => [r.status, r._count])) as Record<string, number>;
  const sent = (id: string, st: string) => perAccount.filter((p) => p.accountId === id && p.status === st).reduce((a, p) => a + p._count, 0);
  const gaOn = !!ga?.enabled;
  return (
    <>
      <PageHeader title="Insights" eyebrow="Readership, enquiries and publishing">
        <p>What this website records itself, for the last {days} days. Visitor behaviour (sources, devices, engagement time) is in Google Analytics, and search performance is in Google Search Console.</p>
      </PageHeader>
      <nav aria-label="Period" className="flex gap-2 mb-6">{RANGES.map((r) => <Link key={r} href={`/admin/insights?days=${r}`} className="chip" aria-current={r === days ? 'true' : undefined}>{r} days</Link>)}</nav>

      <section aria-label="Headline numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-8">
        <Stat label="Article reads" value={read.total.toLocaleString('en-GB')} note="Counted on the server, once per page load. Not unique visitors." />
        <Stat label="Published articles" value={jc.PUBLISHED ?? 0} note={`${jc.SCHEDULED ?? 0} scheduled · ${jc.DRAFT ?? 0} drafts`} />
        <Stat label="Enquiries received" value={sum(byDept)} note={byDept.length ? undefined : 'Visible to roles that handle requests.'} />
        <Stat label="Social posts needing attention" value={(social.NEEDS_MANUAL ?? 0) + (social.FAILED ?? 0)} tone={(social.NEEDS_MANUAL ?? 0) + (social.FAILED ?? 0) ? 'warn' : undefined} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel panel-pad"><h2 className="!text-lg mb-4">Most-read articles</h2><Bars rows={read.top.map((t) => ({ label: t.title, value: t.views }))} /></section>
        <section className="panel panel-pad"><h2 className="!text-lg mb-4">Reads per day</h2><Bars rows={read.byDay.slice(-14).map(([d, v]) => ({ label: d, value: v }))} /></section>
        <section className="panel panel-pad"><h2 className="!text-lg mb-4">Enquiries by department</h2><Bars rows={byDept.map((b) => ({ label: depts.find((d) => d.key === b.department)?.label ?? b.department, value: b._count })).sort((a, b) => b.value - a.value)} /></section>
        <section className="panel panel-pad"><h2 className="!text-lg mb-4">Enquiries by type</h2><Bars rows={byService.map((b) => ({ label: services.find((s) => s.id === b.serviceId)?.name ?? 'Other', value: b._count })).sort((a, b) => b.value - a.value)} /></section>
        <section className="panel panel-pad"><h2 className="!text-lg mb-4">Where enquiries came from</h2><Bars rows={bySource.map((b) => ({ label: b.source ?? 'website', value: b._count })).sort((a, b) => b.value - a.value)} />
          <p className="text-xs text-steel mt-3">“Source” is where the form was filled in on this site (for example a division or opportunity page). It is not the visitor’s referring website; Google Analytics has that.</p></section>
        <section className="panel panel-pad"><h2 className="!text-lg mb-4">Social publishing</h2>
          {accounts.length === 0 ? <p className="text-sm text-steel">No accounts connected.</p> : (
            <div className="table-wrap"><table className="dt"><thead><tr><th>Account</th><th className="num">Posted</th><th className="num">By hand needed</th><th className="num">Failed</th></tr></thead><tbody>
              {accounts.map((a) => <tr key={a.id}><td>{a.displayName}</td><td className="num">{sent(a.id, 'PUBLISHED')}</td><td className="num">{sent(a.id, 'NEEDS_MANUAL')}</td><td className="num">{sent(a.id, 'FAILED')}</td></tr>)}
            </tbody></table></div>
          )}
          <p className="text-xs text-steel mt-3">Likes, reach and clicks are not shown here. Each platform releases them only through its own analytics, so use the “View post” links in the <Link href="/admin/journal/social">publishing log</Link>.</p>
        </section>
      </div>

      <div className="mt-8 grid gap-3 max-w-3xl">
        <Alert tone={gaOn ? 'ok' : 'warn'}>{gaOn ? 'Analytics is switched on. Enquiry submissions are sent to it as “generate_lead” events once a visitor has accepted the cookie notice.' : <>Analytics is switched off. Add a Google Analytics 4 measurement ID under <Link href="/admin/integrations">Integrations</Link> to start recording visits and enquiry conversions.</>}</Alert>
        <Alert tone="info">Search performance (queries, impressions, clicks) lives in Google Search Console. Add the verification code under <Link href="/admin/seo">SEO</Link>, then submit the sitemap.</Alert>
      </div>
    </>
  );
}
