import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Section, RequestCta } from '@/components/blocks';
import { Photo } from '@/components/Photo';
import { ProductCard } from '@/components/catalogue';
import { AddToList } from '@/components/AddToList';
import { Icon } from '@/components/Icon';
import { getProductPage } from '@/server/catalogue';
import { renderMarkdown } from '@/server/markdown';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProductPage((await params).slug);
  return p ? { title: p.name, description: p.summary } : {};
}

const AVAIL: Record<string, string> = { ON_REQUEST: 'Availability confirmed in your quotation', IN_STOCK: 'In stock', ON_ORDER: 'Sourced against your order', DISCONTINUED: 'No longer supplied' };

export default async function ProductPage({ params }: Props) {
  const p = await getProductPage((await params).slug);
  if (!p) notFound();
  const sizes = p.variants.filter((v) => v.availability !== 'DISCONTINUED').map((v) => ({ id: v.id, label: v.label, unit: v.unit, sku: v.sku, availability: v.availability }));
  return (
    <>
      <nav aria-label="Breadcrumb" className="bg-white border-b border-line">
        <ol className="container-x flex flex-wrap items-center gap-x-2 gap-y-1 py-3 text-sm text-steel">
          <li><Link href="/catalogue">Catalogue</Link></li>
          <li className="flex items-center gap-2"><Icon name="chevron" size={14} /><Link href={`/catalogue/${p.category.slug}`}>{p.category.name}</Link></li>
          <li className="flex items-center gap-2"><Icon name="chevron" size={14} /><span aria-current="page" className="text-charcoal font-medium">{p.name}</span></li>
        </ol>
      </nav>
      <section className="bg-white section-tight">
        <div className="container-x grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16 items-start">
          <div>
            <Photo name={p.imageKeys[0] ?? null} className="aspect-square border border-line" sizes="(min-width: 1024px) 45vw, 100vw" priority fit="contain" />
            {p.imageKeys.length > 1 && (
              <ul className="mt-3 grid grid-cols-4 gap-3" aria-label="More photographs">
                {p.imageKeys.slice(1).map((k) => <li key={k}><Photo name={k} className="aspect-square border border-line" sizes="12vw" fit="contain" /></li>)}
              </ul>
            )}
          </div>
          <div>
            <p className="eyebrow">{p.category.name}</p>
            <h1 className="!text-[clamp(1.9rem,3.6vw,2.9rem)] mt-3">{p.name}</h1>
            {p.brand?.visible && <p className="mt-2 text-steel">Brand: <strong className="text-charcoal">{p.brand.name}</strong></p>}
            <p className="lead mt-5">{p.summary}</p>
            {p.highlights.length > 0 && (
              <ul className="mt-6 grid gap-2.5">
                {p.highlights.map((h) => <li key={h} className="flex gap-3 items-start"><span className="text-ember mt-0.5"><Icon name="check" size={18} /></span><span>{h}</span></li>)}
              </ul>
            )}
            <div className="mt-8"><AddToList productId={p.id} productName={p.name} sizes={sizes} /></div>
            <p className="mt-4 text-sm text-steel">Price, availability and delivery are confirmed in a written quotation. Adding to your list is not an order.</p>
          </div>
        </div>
      </section>

      {(p.description || p.specs.length > 0 || p.variants.length > 0) && (
        <Section tone="tint" eyebrow="Details" title="About this product">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
            {p.description && <div className="prose-eu" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.description) }} />}
            <div className="space-y-8">
              {p.specs.length > 0 && (
                <div>
                  <h3 className="mb-3">Specification</h3>
                  <dl className="kv border-t border-line pt-3">
                    {p.specs.map((s) => <div key={s.label} className="contents"><dt>{s.label}</dt><dd>{s.value}</dd></div>)}
                  </dl>
                </div>
              )}
              {p.variants.length > 0 && (
                <div>
                  <h3 className="mb-3">Sizes and options</h3>
                  <div className="table-wrap"><table className="dt"><thead><tr><th>Option</th><th>SKU</th><th>Availability</th></tr></thead>
                    <tbody>{p.variants.map((v) => <tr key={v.id}><td>{v.label}</td><td className="mono">{v.sku ?? '—'}</td><td>{AVAIL[v.availability]}</td></tr>)}</tbody></table></div>
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {p.related.length > 0 && (
        <Section eyebrow="More in this category" title={p.category.name}>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{p.related.map((r) => <li key={r.id}><ProductCard p={r} /></li>)}</ul>
        </Section>
      )}
      <RequestCta />
    </>
  );
}
