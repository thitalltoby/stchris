import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireInternal } from '@/server/rbac';
import { getPostFor, STAFF_POST_KINDS } from '@/server/staff-portal';
import { renderMarkdown } from '@/server/markdown';
import { fmtDate } from '@/lib/format';

export const metadata = { title: 'Post' };

export default async function StaffPost({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireInternal();
  const p = await getPostFor(user, (await params).id).catch(() => null);
  if (!p) notFound();
  return (
    <article className="max-w-2xl">
      <p className="mb-4 text-sm"><Link href="/staff">← All updates</Link></p>
      <p className="text-xs font-semibold uppercase tracking-wider text-steel">{STAFF_POST_KINDS[p.kind]}{p.department ? ` · ${p.department}` : ''}</p>
      <h1 className="!text-3xl mt-1">{p.title}</h1>
      <p className="text-sm text-steel mt-2 mb-6">{p.author.name} · {p.publishedAt ? fmtDate(p.publishedAt) : ''}</p>
      <div className="prose-ed" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.body) }} />
    </article>
  );
}
