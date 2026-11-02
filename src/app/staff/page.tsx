import Link from 'next/link';
import { requireInternal } from '@/server/rbac';
import { listPostsFor, STAFF_POST_KINDS } from '@/server/staff-portal';
import { Empty } from '@/components/ui';
import { fmtDate } from '@/lib/format';

export const metadata = { title: 'Updates' };

export default async function StaffHome({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const user = await requireInternal();
  const kind = (await searchParams).kind;
  const k = kind && kind in STAFF_POST_KINDS ? kind : undefined;
  const posts = await listPostsFor(user, { kind: k });
  return (
    <>
      <h1 className="!text-3xl mb-1">Hello, {user.name.split(' ')[0]}</h1>
      <p className="text-steel mb-6">Announcements, circulars and updates from management and your department.</p>
      <nav aria-label="Filter by type" className="flex flex-wrap gap-2 mb-6">
        <Link href="/staff" className="chip" aria-current={!k ? 'true' : undefined}>All</Link>
        {Object.entries(STAFF_POST_KINDS).map(([v, l]) => <Link key={v} href={`/staff?kind=${v}`} className="chip" aria-current={k === v ? 'true' : undefined}>{l}</Link>)}
      </nav>
      {posts.length === 0 ? <Empty title="Nothing here yet">New announcements and circulars appear here.</Empty> : (
        <ul className="grid gap-3 max-w-3xl">
          {posts.map((p) => (
            <li key={p.id} className="panel">
              <Link href={`/staff/posts/${p.id}`} className="block p-4 !text-charcoal no-underline hover:bg-paper-2/60">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {!p.read && <span className="badge badge-info">New</span>}{p.pinned && <span className="badge badge-warn">Pinned</span>}
                  <span className="font-semibold uppercase tracking-wider text-steel">{STAFF_POST_KINDS[p.kind]}</span><span className="text-steel">{p.publishedAt ? fmtDate(p.publishedAt) : ''}</span>
                </div>
                <p className={`mt-1 text-lg leading-snug ${p.read ? 'font-medium' : 'font-bold'}`}>{p.title}</p>
                <p className="text-sm text-steel mt-1 line-clamp-2">{p.body.replace(/\s+/g, ' ').slice(0, 180)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
