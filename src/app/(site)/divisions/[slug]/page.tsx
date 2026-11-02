import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { CategoryCard } from '@/components/catalogue';
import { PageHead, Band, R } from '@/components/editorial';
import { getDivision, getDivisions } from '@/server/site-content';
import { getCategories } from '@/server/catalogue';
import { renderMarkdown } from '@/server/markdown';
import { pageMetadata } from '@/server/seo';
import { getSetting } from '@/server/settings';
import { WhatsAppButton } from '@/components/WhatsAppButton';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const d = await getDivision((await params).slug);
  return d ? pageMetadata(`/divisions/${d.slug}`, { title: d.name, description: d.summary, image: d.imageKey }) : {};
}

export default async function DivisionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [d, all, cats] = await Promise.all([getDivision(slug), getDivisions(), getCategories()]);
  if (!d) notFound();
  const wa = (await getSetting('company')).whatsapp;
  const highlights = d.highlights as string[];
  const offerings = d.offerings as string[];
  const mine = cats.filter((c) => (d.categorySlugs as string[]).includes(c.slug));
  const others = all.filter((x) => x.id !== d.id);
  return (
    <>
      <PageHead marker="Division" n={`0${d.sortOrder || 1}`} title={d.name} lead={<p>{d.tagline} {d.summary}</p>} photo={d.imageKey ?? undefined}>
        {d.serviceSlug && <Link href={`/request?service=${d.serviceSlug}`} className="btn btn-dark">Enquire about this division <Icon name="arrow" size={18} /></Link>}
        <Link href="/contact" className="btn btn-outline">Talk to the team</Link>
      </PageHead>

      <Band marker="What it covers" tone="white">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <R className="lg:col-span-7"><div className="prose-ed" dangerouslySetInnerHTML={{ __html: renderMarkdown(d.description) }} /></R>
          <R delay={100} className="lg:col-span-5">
            {offerings.length > 0 && <><h3 className="serif !text-[1.00rem]">Product and service lines</h3><ul className="mt-4 flex flex-wrap gap-2">{offerings.map((o) => <li key={o} className="chip">{o}</li>)}</ul></>}
            {highlights.length > 0 && <ul className="mt-8 space-y-3 border-t border-line pt-6">{highlights.map((h) => <li key={h} className="flex gap-3"><span className="text-ember mt-1"><Icon name="check" size={18} /></span><span>{h}</span></li>)}</ul>}
          </R>
        </div>
      </Band>

      {mine.length > 0 && (
        <Band n="02" marker="Product categories" title={<>Browse <em>the range.</em></>}>
          <ul className="grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">{mine.map((c) => <li key={c.id}><CategoryCard c={c} /></li>)}</ul>
        </Band>
      )}

      <section className="bg-white section">
        <div className="container-x grid gap-8 lg:grid-cols-[1.4fr_1fr] items-center">
          <R><h2>Ready to <em>start?</em></h2><p className="mt-6 text-[#3b3e44] max-w-xl text-lg leading-relaxed">Send an enquiry to this division. It goes to the right team, you get a reference number, and you can follow it in your account.</p></R>
          <R delay={100} className="flex flex-wrap gap-3 lg:justify-end">
            {d.serviceSlug && <Link href={`/request?service=${d.serviceSlug}`} className="btn btn-primary">Send an enquiry</Link>}
            <WhatsAppButton number={wa} message={`Hello St. Chris, I would like to ask about ${d.name}.`} where={`division:${d.slug}`} className="btn btn-outline" />
            <Link href="/opportunities" className="btn btn-outline">All ways to work with us</Link>
          </R>
        </div>
      </section>

      <Band marker="Other divisions" tone="white">
        <ul className="flex flex-wrap gap-2">{others.map((o) => <li key={o.id}><Link href={`/divisions/${o.slug}`} className="chip">{o.name}</Link></li>)}</ul>
      </Band>
    </>
  );
}
