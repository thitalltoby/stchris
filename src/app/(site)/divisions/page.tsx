import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Photo } from '@/components/Photo';
import { PageHead, R } from '@/components/editorial';
import { getDivisions } from '@/server/site-content';
import { pageMetadata } from '@/server/seo';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => pageMetadata('/divisions', { title: 'Our divisions', description: 'Building materials, bathroom and kitchen solutions, interior finishing, procurement and sourcing, importation and distribution, and strategic partnerships: the six business areas of St. Chris Global.' });

export default async function DivisionsPage() {
  const divisions = await getDivisions();
  return (
    <>
      <PageHead marker="St. Chris Global" n="01" title={<>Six areas of business, <em>one standard.</em></>} lead={<p>Each division has its own page, its own product range and its own way to enquire.</p>} />
      <section className="bg-white section">
        <div className="container-x">
          <ul className="grid gap-x-12 gap-y-24 md:grid-cols-2">
            {divisions.map((d, i) => (
              <li key={d.id}>
                <R delay={(i % 2) * 100} className="h-full">
                  <Link href={`/divisions/${d.slug}`} className="div-card group">
                    <div className="div-photo"><Photo name={d.imageKey} className="aspect-[4/3]" sizes="(min-width: 768px) 45vw, 100vw" /></div>
                    <p className="mt-9 text-xs font-bold tracking-[.18em] text-ember">0{i + 1}</p>
                    <h2 className="mt-3 !text-[clamp(1.5rem,2.4vw,2rem)]">{d.name}</h2>
                    <p className="serif text-base !font-semibold mt-4 text-charcoal">{d.tagline}</p>
                    <p className="mt-4 text-[#3b3e44] leading-relaxed max-w-md">{d.summary}</p>
                    <p className="mt-auto pt-8"><span className="div-cue">Explore the division <Icon name="arrow" size={16} /></span></p>
                  </Link>
                </R>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
