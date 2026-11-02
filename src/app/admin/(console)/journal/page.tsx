import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { can } from '@/lib/permissions';
import { listArticlesAdmin } from '@/server/journal';
import { socialSummary } from '@/server/social';
import { PageHeader, Badge, Empty, Alert } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';

export const metadata = { title: 'Journal' };
const TONE = { DRAFT: 'neutral', SCHEDULED: 'info', PUBLISHED: 'good', ARCHIVED: 'bad' } as const;
const LABEL = { DRAFT: 'Draft', SCHEDULED: 'Scheduled', PUBLISHED: 'Published', ARCHIVED: 'Removed' } as const;

export default async function JournalAdmin({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; done?: string }> }) {
  const user = await requireStaff();
  if (!can(user.role, 'journal.write') && !can(user.role, 'journal.publish')) await requireStaff('journal.write');
  const sp = await searchParams;
  const status = (['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'] as const).find((s) => s === sp.status);
  const [articles, social] = await Promise.all([listArticlesAdmin(user, { status, q: sp.q }), can(user.role, 'social.publish') ? socialSummary() : Promise.resolve({} as Record<string, number>)]);
  const attention = (social.NEEDS_MANUAL ?? 0) + (social.FAILED ?? 0);
  return (
    <>
      <PageHeader title="Journal" eyebrow="Articles" actions={<><Link href="/admin/journal/new" className="btn btn-primary !min-h-[3rem]">Write an article</Link>{can(user.role, 'social.publish') && <Link href="/admin/journal/social" className="btn btn-outline !min-h-[3rem]">Social queue{attention > 0 ? ` (${attention})` : ''}</Link>}</>} />
      {sp.done === 'deleted' && <div className="mb-4"><Alert tone="ok">Article deleted.</Alert></div>}
      {attention > 0 && <div className="mb-4"><Alert tone="warn"><Link href="/admin/journal/social">{attention} social {attention === 1 ? 'post needs' : 'posts need'} your attention.</Link></Alert></div>}
      <nav aria-label="Filter" className="flex flex-wrap gap-2 mb-5">
        <Link href="/admin/journal" className="chip" aria-current={!status ? 'true' : undefined}>All</Link>
        {(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'] as const).map((s) => <Link key={s} href={`/admin/journal?status=${s}`} className="chip" aria-current={status === s ? 'true' : undefined}>{LABEL[s]}</Link>)}
      </nav>
      {articles.length === 0 ? <Empty title="No articles here yet">Tap “Write an article” to start. You can write on your phone and save a draft at any point.</Empty> : (
        <ul className="grid gap-3">
          {articles.map((a) => {
            const posts = a.social;
            return (
              <li key={a.id} className="panel">
                <Link href={`/admin/journal/${a.id}`} className="block p-4 !text-charcoal no-underline hover:bg-paper-2/60">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={TONE[a.status]}>{LABEL[a.status]}</Badge>{a.kind === 'FEATURE' && <Badge tone="info">Feature</Badge>}<span className="text-xs text-steel">{a.category.name}</span></div>
                  <p className="font-display font-semibold text-lg mt-2 leading-snug">{a.title}</p>
                  <p className="text-sm text-steel mt-1">{a.author.name} · edited {fmtDateTime(a.updatedAt)}{a.status === 'SCHEDULED' && a.scheduledFor ? ` · goes live ${fmtDateTime(a.scheduledFor)}` : ''}</p>
                  {posts.length > 0 && <p className="text-xs text-steel mt-2">Social: {posts.map((p) => `${p.account.displayName} (${p.status.toLowerCase().replace('_', ' ')})`).join(', ')}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
