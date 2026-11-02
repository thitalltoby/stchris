import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { PageHead, Band, R } from '@/components/editorial';
import { getRequestableServices } from '@/server/content';
import { getOpenOpportunities, OPPORTUNITY_KINDS } from '@/server/site-content';
import { pageMetadata } from '@/server/seo';
import { getSetting } from '@/server/settings';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => pageMetadata('/opportunities', { title: 'Opportunities and enquiries', description: 'Buy, partner or connect: quotations, corporate procurement, distribution, supplier introductions, partnership proposals, investment, careers and media requests.' });

const GROUPS = [
  { id: 'buy', n: '02', title: <>Buy <em>from us.</em></>, intro: 'Quotations, bulk and project supply, sourcing, corporate procurement and trade accounts.' },
  { id: 'partner', n: '03', title: <>Partner <em>with us.</em></>, intro: 'Distribution, supplier and manufacturer introductions, partnership proposals, investment and strategic collaboration.' },
  { id: 'connect', n: '04', title: <>Connect <em>with us.</em></>, intro: 'Careers, media and speaking requests, or a plain question.' },
];

export default async function OpportunitiesPage() {
  const [services, open, depts] = await Promise.all([getRequestableServices(), getOpenOpportunities(), getSetting('departments')]);
  const deptName = (k: string) => depts.find((d) => d.key === k)?.label ?? k;
  return (
    <>
      <PageHead marker="Opportunities" n="01" title={<>Every route in <em>is a real one.</em></>} lead={<p>Each form below goes to the department that handles it. You get a reference number straight away, and you can follow the enquiry in your account.</p>} />
      {open.length > 0 && (
        <Band marker="Open now" tone="white" title={<>Current <em>openings.</em></>}>
          <ul className="border-t border-line">{open.map((o) => <li key={o.id}><Link href={`/opportunities/${o.slug}`} className="group row-link md:grid-cols-[14rem_1fr_auto] md:items-center"><span className="tag w-fit">{OPPORTUNITY_KINDS[o.kind]}</span><span><span className="serif text-xl block">{o.title}</span><span className="text-steel text-sm">{o.summary}{o.location ? ` · ${o.location}` : ''}</span></span><span className="row-arrow" aria-hidden="true"><Icon name="arrow" size={20} /></span></Link></li>)}</ul>
        </Band>
      )}
      {GROUPS.map((g, gi) => (
        <section key={g.id} id={g.id} className={`${gi % 2 === 0 ? 'bg-ivory' : 'bg-white'} section scroll-mt-24`}>
          <div className="container-x">
            <R><p className="marker"><b>{g.n}</b><span>{g.id}</span></p></R>
            <div className="mt-8 md:mt-12 mb-12 grid gap-6 lg:grid-cols-12 lg:gap-x-16 lg:items-end"><R className="lg:col-span-7"><h2>{g.title}</h2></R><R delay={100} className="lg:col-span-5 opacity-90">{g.intro}</R></div>
            <ul className="grid gap-x-12 lg:grid-cols-2 border-t border-line">
              {services.filter((s) => s.audience === g.id).map((s) => (
                <li key={s.id}>
                  <Link href={`/request?service=${s.slug}`} className="group row-link !border-t-0 grid-cols-[1fr_auto] items-center">
                    <span><span className="block serif text-[1.35rem]">{s.name}</span><span className="block mt-1 text-steel text-[0.95rem] max-w-md">{s.summary}</span><span className="mt-2 block mono text-xs text-steel">Goes to: {deptName(s.department)}</span></span>
                    <span className="row-arrow" aria-hidden="true"><Icon name="arrow" size={20} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </>
  );
}
