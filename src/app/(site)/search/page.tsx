import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHero, Section } from '@/components/blocks';
import { Icon } from '@/components/Icon';
import { AddRangeLine } from '@/components/AddToList';
import { searchCatalogue } from '@/server/catalogue';

export const metadata: Metadata = { title: 'Search the catalogue', robots: { index: false } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').slice(0, 80);
  const hits = await searchCatalogue(q);
  const lines = hits.filter((h) => h.kind === 'range');
  const rest = hits.filter((h) => h.kind !== 'range');
  return (
    <>
      <PageHero compact eyebrow="Catalogue" title={q.trim() ? `Results for “${q.trim()}”` : 'Search the catalogue'}>
        <form action="/search" role="search" className="flex max-w-xl gap-2">
          <label htmlFor="q" className="sr-only">Search</label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="Basin mixer, porcelain tile, water tank…" autoFocus={!q} />
          <button className="btn btn-dark" type="submit"><Icon name="search" size={18} />Search</button>
        </form>
      </PageHero>
      <Section>
        {q.trim().length >= 2 && hits.length === 0 && (
          <div className="panel panel-pad max-w-2xl">
            <h2 className="!text-xl">Nothing in the catalogue matches that</h2>
            <p className="text-steel mt-2">That does not mean we cannot supply it. Add it to your project list in your own words, or ask us to source it.</p>
            <div className="mt-5 flex flex-wrap gap-3"><Link href="/list" className="btn btn-primary">Open my project list</Link><Link href="/services/source-a-product" className="btn btn-outline">Source something specific</Link></div>
          </div>
        )}
        {rest.length > 0 && (
          <ul className="max-w-3xl border-t border-line">
            {rest.map((h) => (
              <li key={`${h.kind}-${h.href}`}>
                <Link href={h.href} className="group row-link grid-cols-[1fr_auto] items-center !py-4">
                  <span><span className="block font-display font-semibold text-[1.1rem]">{h.label}</span><span className="block text-sm text-steel">{h.kind === 'product' ? 'Product' : 'Category'} · {h.hint}</span></span>
                  <span className="row-arrow" aria-hidden="true"><Icon name="arrow" size={20} /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {lines.length > 0 && (
          <div className="mt-10">
            <h2 className="!text-xl mb-4">Lines we supply</h2>
            <ul className="flex flex-wrap gap-3">{lines.map((h) => <li key={`${h.hint}-${h.label}`}><AddRangeLine label={h.label} categoryName={h.hint} /></li>)}</ul>
          </div>
        )}
        {q.trim().length < 2 && <p className="text-steel">Type at least two letters.</p>}
      </Section>
    </>
  );
}
