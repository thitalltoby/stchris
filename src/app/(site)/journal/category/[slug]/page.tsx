import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead, ArticleCard, R } from '@/components/editorial';
import { Pagination, qs } from '@/components/ui';
import { categoriesWithCounts, listPublished } from '@/server/journal';
import { pageMetadata } from '@/server/seo';

export const dynamic = 'force-dynamic';
const PER = 9;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = (await categoriesWithCounts()).find((x) => x.slug === slug);
  return c ? pageMetadata(`/journal/category/${c.slug}`, { title: `${c.name}: the journal`, description: c.description || `Articles in ${c.name}.` }) : {};
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }) {
  const { slug } = await params;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const cats = await categoriesWithCounts();
  const c = cats.find((x) => x.slug === slug);
  if (!c) notFound();
  const { items, total } = await listPublished({ category: slug, take: PER, skip: (page - 1) * PER });
  return (
    <>
      <PageHead marker="The journal" title={c.name} lead={<p>{c.description}</p>} />
      <section className="bg-white section-tight">
        <div className="container-x">
          <nav aria-label="Categories" className="flex flex-wrap gap-2 mb-12">
            <Link href="/journal" className="chip">All</Link>
            {cats.map((k) => <Link key={k.id} href={`/journal/category/${k.slug}`} className="chip" aria-current={k.slug === slug ? 'true' : undefined}>{k.name}</Link>)}
          </nav>
          {total === 0 ? <p className="serif text-2xl max-w-xl">Nothing in this category yet.</p> : (
            <div className="grid gap-x-10 gap-y-14 md:grid-cols-2 lg:grid-cols-3">{items.map((a, i) => <R key={a.id} delay={(i % 3) * 90}><ArticleCard a={a} /></R>)}</div>
          )}
          <div className="mt-14"><Pagination page={page} pages={Math.max(1, Math.ceil(total / PER))} hrefFor={(p) => `/journal/category/${slug}${qs({ page: p > 1 ? p : undefined })}`} /></div>
        </div>
      </section>
    </>
  );
}
