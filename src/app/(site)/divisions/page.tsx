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
        <div className="container-x space-y-20 md:space-y-28">
          {divisions.map((d, i) => (
            <R key={d.id}>
              <Link href={`/divisions/${d.slug}`} className="group ed-card grid gap-8 lg:grid-cols-12 lg:gap-14 items-center">
                <div className={`lg:col-span-7 ${i % 2 ? 'lg:order-2' : ''}`}><Photo name={d.imageKey} className="aspect-[16/10]" sizes="(min-width: 1024px) 58vw, 100vw" /></div>
                <div className={`lg:col-span-5 ${i % 2 ? 'lg:order-1' : ''}`}>
                  <p className="mono text-sm text-ember">0{i + 1}</p>
                  <h2 className="mt-3 !text-[clamp(1.9rem,3.4vw,2.8rem)]">{d.name}</h2>
                  <p className="serif italic text-xl mt-3 text-steel">{d.tagline}</p>
                  <p className="mt-4 text-steel max-w-md">{d.summary}</p>
                  <span className="mt-6 link-arrow">Explore the division <Icon name="arrow" size={18} /></span>
                </div>
              </Link>
            </R>
          ))}
        </div>
      </section>
    </>
  );
}
