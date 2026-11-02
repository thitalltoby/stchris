import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Photo } from '@/components/Photo';
import { PageHead, Band, R } from '@/components/editorial';
import { RequestCta } from '@/components/blocks';
import { ProductCard } from '@/components/catalogue';
import { getCategoryPage } from '@/server/catalogue';
import { db } from '@/server/db';
import { pageMetadata } from '@/server/seo';
import { GEEPEE } from '@/content/geepee';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => pageMetadata(GEEPEE.hub, {
  title: 'Major distributor of GeePee Water Tanks',
  description: `St. Chris Global is a major distributor and strategic partner of ${GEEPEE.name} (${GEEPEE.group}), ${GEEPEE.claim}. Water storage tanks for dealers, contractors, developers and households, quoted in writing.`,
  image: 'tank-black-4',
});

const PILLARS = [
  { t: 'Major distributor', d: 'We supply GeePee tanks through wholesale, dealer, project and retail channels, and confirm sizes, price and delivery in a written quotation.' },
  { t: 'Strategic partner', d: `A long-term relationship with ${GEEPEE.claim}, built on trust, consistency and shared commercial goals.` },
  { t: 'Led from the top', d: 'Chris Iyoha leads St. Chris Global and the partnership. The long-standing relationship between his business and GeePee is part of how St. Chris earns trust in the market.' },
];
const AUDIENCE = [
  { t: 'Dealers and resellers', d: 'Stock GeePee tanks for your customers with a distributor behind you.', href: '/services/dealer-partnership', cta: 'Dealer partnership' },
  { t: 'Contractors and developers', d: 'Bulk and project supply, with quantities, delivery and pricing agreed in writing.', href: '/services/project-bulk-supply', cta: 'Project and bulk supply' },
  { t: 'Households and businesses', d: 'Tell us the capacity you need and where it will go. We quote it and follow it up.', href: '/services/materials-quotation', cta: 'Request a quotation' },
];

export default async function GeePeeHubPage() {
  const [cat, story] = await Promise.all([getCategoryPage('water-storage-tanks'), db.article.count({ where: { slug: 'geepee-tanks-partnership', status: 'PUBLISHED' } })]);
  const products = cat?.products ?? [];
  return (
    <>
      <PageHead
        marker="Strategic partnership"
        title={<>Major distributor of <em>{GEEPEE.name}</em></>}
        lead={<p>St. Chris Global is a major distributor and strategic partner of {GEEPEE.group} ({GEEPEE.name}), {GEEPEE.claim}.</p>}
        photo="tank-black-4"
        photoCaption={`${GEEPEE.name} water storage tanks, supplied by St. Chris Global.`}
      >
        <Link href="/catalogue/water-storage-tanks" className="btn btn-dark">See the tank range <Icon name="arrow" size={18} /></Link>
        <Link href="/services/dealer-partnership" className="btn btn-outline">Become a dealer</Link>
      </PageHead>

      <Band n="01" marker="The relationship" title={<>Two businesses, <em>one standard.</em></>} intro="What the partnership means for the people who buy, stock and specify water storage.">
        <ul className="grid gap-x-10 gap-y-12 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <li key={p.t}><R delay={i * 90}><div className="border-t-2 border-charcoal pt-6"><span className="stat-num" aria-hidden="true">0{i + 1}</span><h3 className="mt-4">{p.t}</h3><p className="mt-3 text-steel leading-relaxed">{p.d}</p></div></R></li>
          ))}
        </ul>
      </Band>

      {products.length > 0 && (
        <Band n="02" marker="The range" title={<>GeePee tanks <em>we supply.</em></>} intro="Specific capacities and models are confirmed in your quotation, with availability and delivery.">
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{products.map((p) => <li key={p.id}><ProductCard p={p} /></li>)}</ul>
          <p className="mt-8"><Link href="/catalogue/water-storage-tanks" className="link-arrow">The full water storage range <Icon name="arrow" size={18} /></Link></p>
        </Band>
      )}

      <Band n={products.length > 0 ? '03' : '02'} marker="Who we supply" tone="white" title={<>One partnership, <em>three ways in.</em></>}>
        <ul className="grid gap-px bg-line border border-line md:grid-cols-3">
          {AUDIENCE.map((a, i) => (
            <li key={a.t} className="bg-white p-8 flex flex-col"><R delay={i * 90} className="flex flex-col flex-1"><h3>{a.t}</h3><p className="mt-3 text-steel leading-relaxed flex-1">{a.d}</p><Link href={a.href} className="link-arrow mt-6 self-start">{a.cta} <Icon name="arrow" size={18} /></Link></R></li>
          ))}
        </ul>
      </Band>

      <section className="bg-white section">
        <div className="container-x grid gap-16 lg:grid-cols-12 lg:gap-24 items-center">
          <R className="lg:col-span-5"><div className="grid grid-cols-2 gap-4"><Photo name="tank-blue" className="aspect-[3/4]" sizes="(min-width: 1024px) 20vw, 45vw" /><Photo name="tank-black-5" className="aspect-[3/4]" sizes="(min-width: 1024px) 20vw, 45vw" /></div></R>
          <div className="lg:col-span-7">
            <R><h2>About the manufacturer</h2></R>
            <R delay={80}><p className="lead-sans mt-6">{GEEPEE.name} is part of the {GEEPEE.group}. It describes itself as {GEEPEE.claim}. For the manufacturer&apos;s own account of its products, plants and history, visit its website.</p></R>
            <R delay={140} className="mt-8 flex flex-wrap gap-3">
              <a href={GEEPEE.site} rel="noopener noreferrer" target="_blank" className="btn btn-primary">Visit geepee.com <span className="sr-only">(opens a new site)</span><Icon name="arrow" size={18} /></a>
              {story > 0 && <Link href={GEEPEE.story} className="btn btn-outline">Read the partnership story</Link>}
            </R>
          </div>
        </div>
      </section>
      <RequestCta />
    </>
  );
}
