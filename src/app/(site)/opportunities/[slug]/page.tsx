import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead, Band } from '@/components/editorial';
import { getOpportunity, OPPORTUNITY_KINDS } from '@/server/site-content';
import { renderMarkdown } from '@/server/markdown';
import { pageMetadata } from '@/server/seo';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const KIND_SERVICE: Record<string, string> = { CAREER: 'career-interest', DISTRIBUTION: 'dealer-partnership', PARTNERSHIP: 'partnership-proposal', SUPPLIER: 'supplier-introduction', PROCUREMENT: 'corporate-procurement', INVESTMENT: 'investment-enquiry' };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const o = await getOpportunity((await params).slug);
  return o ? pageMetadata(`/opportunities/${o.slug}`, { title: o.title, description: o.summary }) : {};
}

export default async function OpportunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const o = await getOpportunity((await params).slug);
  if (!o) notFound();
  const service = KIND_SERVICE[o.kind] ?? 'ask-a-question';
  return (
    <>
      <PageHead marker={OPPORTUNITY_KINDS[o.kind] ?? 'Opportunity'} title={o.title} lead={<p>{o.summary}</p>}>
        <Link href={`/request?service=${service}&opportunity=${o.slug}`} className="btn btn-dark">Express interest</Link>
        <Link href="/opportunities" className="btn btn-outline">All opportunities</Link>
      </PageHead>
      <Band marker="Details" tone="white">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-8">{o.body ? <div className="prose-ed" dangerouslySetInnerHTML={{ __html: renderMarkdown(o.body) }} /> : <p className="text-steel">Send an expression of interest and the team will share details.</p>}</div>
          <dl className="lg:col-span-4 kv !grid-cols-1 border-t-2 border-charcoal pt-6 h-fit">
            {o.location && <><dt>Location</dt><dd>{o.location}</dd></>}
            {o.closesOn && <><dt>Closes</dt><dd>{fmtDate(o.closesOn)}</dd></>}
            <dt>Posted</dt><dd>{fmtDate(o.publishedAt)}</dd>
          </dl>
        </div>
      </Band>
    </>
  );
}
