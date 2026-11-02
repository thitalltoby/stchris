import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHero, Section, RequestCta } from '@/components/blocks';
import { CategoryCard } from '@/components/catalogue';
import { Icon } from '@/components/Icon';
import { getCategoriesByGroup } from '@/server/catalogue';

export const metadata: Metadata = { title: 'Catalogue', description: 'Building materials, water storage, plumbing, bathroom and kitchen solutions, tiles and interior finishing from St. Chris Global.' };

export default async function CataloguePage() {
  const groups = await getCategoriesByGroup();
  return (
    <>
      <PageHero eyebrow="Catalogue" title="Everything for the build, the bathroom and the finish" photo="bathroom-stone">
        <p>Browse by category and add what you need to your project list. We confirm availability and price in a written quotation. If you cannot see an item, describe it and we will source it.</p>
        <form action="/search" className="mt-7 flex max-w-xl gap-2" role="search">
          <label htmlFor="cat-q" className="sr-only">Search the catalogue</label>
          <input id="cat-q" name="q" className="input" placeholder="Search the catalogue" />
          <button className="btn btn-dark" type="submit"><Icon name="search" size={18} />Search</button>
        </form>
      </PageHero>
      {groups.map((g, gi) => (
        <Section key={g.label} tone={gi % 2 ? 'tint' : 'plain'} eyebrow={`Part ${gi + 1}`} title={g.label}>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.categories.map((c) => <li key={c.id}><CategoryCard c={c} /></li>)}
          </ul>
        </Section>
      ))}
      <Section tone="tint">
        <div className="panel rule-top panel-pad max-w-3xl">
          <h2 className="!text-2xl">Not listed here?</h2>
          <p className="mt-2 text-steel">Sourcing and importation are part of what we do. <Link href="/services/source-a-product">Tell us what you are looking for</Link>, or add it to your project list in your own words.</p>
        </div>
      </Section>
      <RequestCta />
    </>
  );
}
