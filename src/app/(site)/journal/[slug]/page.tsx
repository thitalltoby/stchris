import { notFound } from 'next/navigation';
import { ArticleView } from '@/components/ArticleView';
import { getPublishedBySlug, getRelated, recordView } from '@/server/journal';
import { pageMetadata } from '@/server/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const a = await getPublishedBySlug((await params).slug);
  if (!a) return {};
  return pageMetadata(`/journal/${a.slug}`, { title: a.seoTitle || a.title, description: a.seoDescription || a.excerpt, image: a.featuredImageKey, type: 'article', publishedTime: a.publishedAt, authors: [a.author.name], tags: a.tags as string[] });
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const a = await getPublishedBySlug((await params).slug);
  if (!a) notFound();
  const related = await getRelated(a.id, a.categoryId);
  await recordView(a.id);
  return <ArticleView a={a} related={related} />;
}
