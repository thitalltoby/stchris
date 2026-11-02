import { notFound } from 'next/navigation';
import { requireStaff } from '@/server/rbac';
import { getArticleAdmin } from '@/server/journal';
import { ArticleView } from '@/components/ArticleView';
import { findPlaceholders } from '@/lib/journal';

export const metadata = { title: 'Preview', robots: { index: false, follow: false } };

export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff('journal.write').catch(async () => requireStaff('journal.publish'));
  const a = await getArticleAdmin(user, (await params).id).catch(() => null);
  if (!a) notFound();
  const marks = findPlaceholders([a.title, a.excerpt, a.body].join('\n'));
  return (
    <div className="ed -m-4 md:-m-8">
      <div className="bg-brand text-umber px-4 py-3 text-sm font-semibold" role="status">
        Preview: only you can see this. {a.status === 'PUBLISHED' ? 'This article is live.' : 'This article is not published yet.'}
        {marks.length > 0 && ` It still has ${marks.length} unfinished [[…]] marker${marks.length === 1 ? '' : 's'}, which must be replaced before it can be published.`}
      </div>
      <ArticleView a={a} preview />
    </div>
  );
}
