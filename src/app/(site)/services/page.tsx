import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHero, RequestCta } from '@/components/blocks';
import { Icon } from '@/components/Icon';
import { Photo } from '@/components/Photo';
import { getVisibleServices } from '@/server/content';
import { SEGMENTS } from '@/content/seed-content';

export const metadata: Metadata = { title: 'Ways to buy', description: 'Quote a project list, bulk and project supply, sourcing, trade accounts, and dealer or supplier partnerships with St. Chris Global.' };

export default async function ServicesPage() {
  const services = (await getVisibleServices()).filter((s) => s.slug !== 'ask-a-question');
  return (
    <>
      <PageHero eyebrow="Ways to buy" title="One desk, several ways to buy" photo="warehouse-pallets">
        <p>Wholesale and retail, project and bulk, local and imported. Pick the route that matches how you buy; each ends in a written quotation or a reply from the team.</p>
      </PageHero>
      <section className="bg-white section">
        <div className="container-x">
          <ul className="grid gap-x-10 gap-y-12 md:grid-cols-2">
            {services.map((s) => (
              <li key={s.id}>
                <Link href={`/services/${s.slug}`} className="group block no-underline">
                  {s.imageKey && <Photo name={s.imageKey} className="aspect-[16/9]" sizes="(min-width: 768px) 40vw, 100vw" />}
                  <p className="eyebrow mt-5">{s.pillar}</p>
                  <h2 className="!text-[1.6rem] mt-2 group-hover:text-ember">{s.name}</h2>
                  <p className="mt-2 text-steel max-w-lg">{s.summary}</p>
                  <span className="link-arrow mt-3">See how it works <Icon name="arrow" size={18} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="bg-white section-tight border-t border-line">
        <div className="container-x">
          <h2 className="!text-[1.8rem] mb-8">Which one is for me?</h2>
          <ul className="grid gap-x-12 md:grid-cols-2 border-t border-line">
            {SEGMENTS.map((g) => (
              <li key={g.name}>
                <Link href={g.to} className="group row-link !border-t-0 grid-cols-[1fr_auto] items-center">
                  <span><span className="block font-display font-semibold text-[1.1rem]">{g.name}</span><span className="block mt-1 text-steel text-[0.95rem] max-w-md">{g.text}</span></span>
                  <span className="row-arrow" aria-hidden="true"><Icon name="arrow" size={20} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <RequestCta />
    </>
  );
}
