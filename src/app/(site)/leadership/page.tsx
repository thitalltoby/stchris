import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { PageHead, Band, R } from '@/components/editorial';
import { getSetting } from '@/server/settings';
import { getTimeline, getOpenOpportunities, OPPORTUNITY_KINDS } from '@/server/site-content';
import { getMediaItems } from '@/server/site-content';
import { pageMetadata } from '@/server/seo';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => pageMetadata('/leadership', { title: 'Leadership, Career & Opportunities', description: 'The career, leadership engagements, collaborations and industry contributions of Chris Iyoha, and the opportunities that come with his business network.', image: 'leadership-meeting' });

export default async function LeadershipPage() {
  const [e, entries, open, speaking] = await Promise.all([getSetting('executive'), getTimeline('chris'), getOpenOpportunities(), getMediaItems(['SPEAKING', 'CONFERENCE'])]);
  const career = entries.filter((x) => x.kind === 'CAREER');
  const engagements = entries.filter((x) => x.kind === 'LEADERSHIP' || x.kind === 'TRAINING');
  const contributions = entries.filter((x) => x.kind === 'MILESTONE');
  const lead = e.sections.find((s) => s.id === 'leadership');
  let n = 1;
  const num = () => `0${++n}`;
  return (
    <>
      <PageHead marker="Chris Iyoha" n="01" title={<>Leadership, career <em>& opportunities.</em></>} lead={<p>{lead?.body ?? e.headline}</p>} photo="leadership-meeting" photoCaption="Chris Iyoha with colleagues">
        <Link href="/request?service=media-speaking" className="btn btn-dark">Invite Chris to speak <Icon name="arrow" size={18} /></Link>
        <Link href="/opportunities" className="btn btn-outline">See opportunities</Link>
      </PageHead>

      {career.length > 0 && (
        <Band n={num()} marker="Career journey" tone="white" title={<>How the career <em>unfolded.</em></>}>
          <ol className="timeline max-w-3xl">{career.map((x) => <li key={x.id}><R>{x.period && <p className="mono text-sm text-ember">{x.period}</p>}<h3 className="serif !text-[1.5rem] !font-normal mt-1">{x.title}</h3>{x.body && <p className="mt-2 text-steel max-w-xl">{x.body}</p>}</R></li>)}</ol>
        </Band>
      )}

      {engagements.length > 0 && (
        <Band n={num()} marker="Leadership engagements" tone="ivory" title={<>Training and <em>mentoring.</em></>}>
          <ul className="grid gap-10 md:grid-cols-2">{engagements.map((x, i) => <li key={x.id}><R delay={i * 80}><div className="border-t-2 border-charcoal pt-5">{x.period && <p className="mono text-sm text-ember">{x.period}</p>}<h3 className="serif !text-[1.5rem] !font-normal mt-1">{x.title}</h3>{x.body && <p className="mt-3 text-steel">{x.body}</p>}</div></R></li>)}</ul>
        </Band>
      )}

      {speaking.length > 0 && (
        <Band n={num()} marker="Speaking and conferences" tone="white" title={<>On stage <em>and on record.</em></>} intro={<Link href="/media-centre" className="link-arrow">The media centre <Icon name="arrow" size={18} /></Link>}>
          <ul className="border-t border-line">{speaking.slice(0, 6).map((m) => <li key={m.id} className="grid gap-1 md:grid-cols-[10rem_1fr] py-5 border-b border-line"><span className="mono text-sm text-steel">{fmtDate(m.eventDate)}</span><span><span className="serif text-xl">{m.title}</span>{(m.source || m.location) && <span className="block text-steel text-sm">{[m.source, m.location].filter(Boolean).join(' · ')}</span>}</span></li>)}</ul>
        </Band>
      )}

      {contributions.length > 0 && (
        <Band n={num()} marker="Collaborations and industry contributions" tone="sand" title={<>Work with <em>wider reach.</em></>}>
          <ul className="grid gap-10 md:grid-cols-2">{contributions.map((x) => <li key={x.id}><div className="border-t-2 border-charcoal pt-5">{x.period && <p className="mono text-sm text-ember">{x.period}</p>}<h3 className="serif !text-[1.5rem] !font-normal mt-1">{x.title}</h3>{x.body && <p className="mt-3 text-steel">{x.body}</p>}</div></li>)}</ul>
        </Band>
      )}

      <Band n={num()} marker="Opportunities in the network" tone={contributions.length ? 'white' : 'ivory'} title={<>Opportunities <em>that come with it.</em></>} intro="Partnerships, distribution, supply, procurement, investment and careers. Open roles and openings are listed here when there are any; you can always send an expression of interest.">
        {open.length > 0 && (
          <ul className="border-t border-line mb-12">
            {open.map((o) => <li key={o.id}><Link href={`/opportunities/${o.slug}`} className="group row-link md:grid-cols-[12rem_1fr_auto] md:items-center"><span className="tag w-fit">{OPPORTUNITY_KINDS[o.kind]}</span><span><span className="serif text-xl block">{o.title}</span><span className="text-steel text-sm">{o.summary}</span></span><span className="row-arrow" aria-hidden="true"><Icon name="arrow" size={20} /></span></Link></li>)}
          </ul>
        )}
        <div className="flex flex-wrap gap-3">
          <Link href="/request?service=career-interest" className="btn btn-primary">Express career interest</Link>
          <Link href="/request?service=partnership-proposal" className="btn btn-outline">Propose a partnership</Link>
          <Link href="/opportunities" className="btn btn-outline">All opportunities</Link>
        </div>
      </Band>
    </>
  );
}
