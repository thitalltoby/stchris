import { requireStaff } from '@/server/rbac';
import { can } from '@/lib/permissions';
import { getArticleAdmin, getJournalCategories } from '@/server/journal';
import { listAccounts } from '@/server/social';
import { photoOptions } from '@/server/media';
import { env } from '@/server/env';
import { PageHeader, Alert } from '@/components/ui';
import { ArticleEditor } from '@/components/ArticleEditor';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { saveArticleAction, deleteArticleAction } from '../actions';
import { toLagosLocalInput } from '@/lib/format';
import type { Platform } from '@/lib/journal';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Edit article' };
const DONE: Record<string, string> = { save: 'Saved.', share: 'Saved.', publish: 'Published. It is on the site now; social posts are on their way.', schedule: 'Scheduled. It will go live by itself at that time.', unpublish: 'Taken off the site and returned to draft.', archive: 'Removed from the site. You can restore it later.', restore: 'Restored as a draft.' };

export default async function EditArticle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const user = await requireStaff('journal.write').catch(async () => requireStaff('journal.publish'));
  const { id } = await params;
  const a = await getArticleAdmin(user, id).catch(() => null);
  if (!a) notFound();
  const done = (await searchParams).done;
  const [cats, photos, accounts] = await Promise.all([getJournalCategories(), photoOptions(), can(user.role, 'social.publish') ? listAccounts() : Promise.resolve([])]);
  return (
    <>
      <PageHeader title={a.title || 'Edit article'} eyebrow={`Journal · ${a.kind === 'FEATURE' ? 'Feature' : 'Article'}`} />
      {done && DONE[done] && <div className="mb-4 max-w-3xl"><Alert tone="ok">{DONE[done]}</Alert></div>}
      <ArticleEditor
        action={saveArticleAction}
        article={{ id: a.id, title: a.title, subtitle: a.subtitle ?? '', excerpt: a.excerpt, body: a.body, categoryId: a.categoryId, tags: (a.tags as string[]).join(', '), featuredImageKey: a.featuredImageKey ?? '', featuredImageAlt: a.featuredImageAlt ?? '', videoUrl: a.videoUrl ?? '', seoTitle: a.seoTitle ?? '', seoDescription: a.seoDescription ?? '', slug: a.slug, status: a.status, scheduledFor: toLagosLocalInput(a.scheduledFor), publishedAt: a.publishedAt?.toISOString() ?? null }}
        categories={cats.map((c) => ({ value: c.id, label: c.name }))} photos={photos}
        accounts={accounts.map((acc) => { const p = a.social.find((s) => s.accountId === acc.id); return { id: acc.id, platform: acc.platform as Platform, displayName: acc.displayName, mode: acc.mode, status: acc.status, lastError: acc.lastError, post: p ? { status: p.status, caption: p.caption, hashtags: p.hashtags as string[], includeLink: p.includeLink, error: p.error, note: p.note, externalUrl: p.externalUrl } : null }; })}
        canPublish={can(user.role, 'journal.publish')} canSocial={can(user.role, 'social.publish')} siteUrl={env.APP_URL}
      />
      {can(user.role, 'journal.publish') && a.status !== 'PUBLISHED' && (
        <details className="max-w-3xl mt-10 mb-28 panel panel-pad">
          <summary className="cursor-pointer font-semibold text-ember min-h-[2.75rem] flex items-center">Delete this article permanently…</summary>
          <p className="mt-2 text-sm text-steel">This cannot be undone. Social posts already sent stay on their platforms.</p>
          <ActionForm action={deleteArticleAction} className="mt-3"><input type="hidden" name="id" value={a.id} /><SubmitButton className="btn btn-danger" pending="Deleting…">Delete permanently</SubmitButton></ActionForm>
        </details>
      )}
    </>
  );
}
