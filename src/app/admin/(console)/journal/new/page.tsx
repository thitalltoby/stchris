import { requireStaff } from '@/server/rbac';
import { can } from '@/lib/permissions';
import { getJournalCategories } from '@/server/journal';
import { listAccounts } from '@/server/social';
import { photoOptions } from '@/server/media';
import { env } from '@/server/env';
import { PageHeader } from '@/components/ui';
import { ArticleEditor } from '@/components/ArticleEditor';
import { saveArticleAction } from '../actions';
import type { Platform } from '@/lib/journal';

export const metadata = { title: 'New article' };

export default async function NewArticle() {
  const user = await requireStaff('journal.write');
  const [cats, photos, accounts] = await Promise.all([getJournalCategories(), photoOptions(), can(user.role, 'social.publish') ? listAccounts() : Promise.resolve([])]);
  return (
    <>
      <PageHeader title="New article" eyebrow="Journal" />
      <ArticleEditor
        action={saveArticleAction}
        article={{ id: null, title: '', subtitle: '', excerpt: '', body: '', categoryId: cats[0]?.id ?? '', tags: '', featuredImageKey: '', featuredImageAlt: '', videoUrl: '', seoTitle: '', seoDescription: '', slug: '', status: 'DRAFT', scheduledFor: '', publishedAt: null }}
        categories={cats.map((c) => ({ value: c.id, label: c.name }))} photos={photos}
        accounts={accounts.map((a) => ({ id: a.id, platform: a.platform as Platform, displayName: a.displayName, mode: a.mode, status: a.status, lastError: a.lastError, post: null }))}
        canPublish={can(user.role, 'journal.publish')} canSocial={can(user.role, 'social.publish')} siteUrl={env.APP_URL}
      />
    </>
  );
}
