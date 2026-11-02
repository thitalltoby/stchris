import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHero, Section, RequestCta } from '@/components/blocks';
import { ProductCard } from '@/components/catalogue';
import { AddRangeLine } from '@/components/AddToList';
import { Icon } from '@/components/Icon';
import { getCategoryPage } from '@/server/catalogue';
import { renderMarkdown } from '@/server/markdown';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCategoryPage((await params).slug);
  return c ? { title: c.name, description: c.summary } : {};
}

export default async function CategoryPage({ params }: Props) {
  const c = await getCategoryPage((await params).slug);
  if (!c) notFound();
  return (
    <>
      <PageHero eyebrow={c.groupLabel} title={c.name} photo={c.imageKey ?? undefined}>
        <p>{c.summary}</p>
      </PageHero>
      <nav aria-label="Breadcrumb" className="bg-white border-b border-line">
        <ol className="container-x flex flex-wrap items-center gap-x-2 gap-y-1 py-3 text-sm text-steel">
          <li><Link href="/catalogue">Catalogue</Link></li>
          <li className="flex items-center gap-2"><Icon name="chevron" size={14} /><span aria-current="page" className="text-charcoal font-medium">{c.name}</span></li>
        </ol>
      </nav>

      {c.products.length > 0 && (
        <Section eyebrow="Products" title={`${c.products.length === 1 ? 'Product' : 'Products'} in this category`}>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {c.products.map((p) => <li key={p.id}><ProductCard p={p} /></li>)}
          </ul>
        </Section>
      )}

      <Section tone={c.products.length ? 'tint' : 'plain'} eyebrow="What we supply" title={c.products.length ? 'The wider range' : 'Lines in this category'}
        intro="Tap a line to add it to your project list. We match it to a product and confirm availability, brand and price in your quotation.">
        <ul className="flex flex-wrap gap-3">
          {c.range.map((r) => <li key={r}><AddRangeLine label={r} categoryName={c.name} /></li>)}
        </ul>
        {c.description && <div className="prose-eu mt-12" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.description) }} />}
        <p className="mt-10 text-sm text-steel max-w-xl">These lines come from our product interests. Specific models, sizes and brands are listed as we confirm them with our suppliers.</p>
      </Section>
      <RequestCta />
    </>
  );
}
