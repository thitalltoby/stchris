import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHero, Section, RequestCta, NotBooking } from '@/components/blocks';
import { Icon } from '@/components/Icon';
import { Photo } from '@/components/Photo';
import { getServiceBySlug } from '@/server/content';
import { renderMarkdown } from '@/server/markdown';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await getServiceBySlug((await params).slug);
  return s ? { title: s.name, description: s.summary } : {};
}

export default async function ServicePage({ params }: Props) {
  const s = await getServiceBySlug((await params).slug);
  if (!s) notFound();
  const highlights = Array.isArray(s.highlights) ? (s.highlights as string[]) : [];
  const required = s.fields.filter((f) => f.required);
  return (
    <>
      <PageHero eyebrow={s.pillar} title={s.name} photo={s.imageKey ?? undefined}>
        <p>{s.summary}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href={s.acceptsItems ? `/list` : `/request?service=${s.slug}`} className="btn btn-primary !min-h-[3rem]">{s.acceptsItems ? 'Open my project list' : 'Start this request'} <Icon name="arrow" size={18} /></Link>
          {s.acceptsItems && <Link href={`/request?service=${s.slug}`} className="btn btn-outline !min-h-[3rem]">Go straight to the form</Link>}
        </div>
      </PageHero>
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="prose-eu" dangerouslySetInnerHTML={{ __html: renderMarkdown(s.description) }} />
            {highlights.length > 0 && (
              <ul className="mt-8 grid gap-3 max-w-2xl">
                {highlights.map((h) => <li key={h} className="flex gap-3 items-start"><span className="text-ember mt-0.5"><Icon name="check" size={18} /></span><span>{h}</span></li>)}
              </ul>
            )}
          </div>
          <aside className="space-y-6">
            <div className="panel rule-top panel-pad">
              <h2 className="!text-xl">What we will ask you</h2>
              <p className="text-steel mt-2 text-[0.95rem]">{s.instructions}</p>
              <ul className="mt-4 space-y-1.5 text-[0.95rem]">
                {required.map((f) => <li key={f.id} className="flex gap-2"><span className="text-ember" aria-hidden="true">▸</span>{f.label}</li>)}
              </ul>
              <Link href={`/request?service=${s.slug}`} className="btn btn-primary w-full mt-6">Start the request</Link>
              <div className="mt-4"><NotBooking /></div>
            </div>
            {s.imageKey && <Photo name={s.imageKey} className="aspect-[4/3]" sizes="(min-width: 1024px) 30vw, 100vw" />}
          </aside>
        </div>
      </Section>
      <RequestCta title={s.acceptsItems ? 'Ready to put your list together?' : 'Ready to start?'} text="Describe what you need. You get a reference number straight away, and any price comes back as a written quotation." href={`/request?service=${s.slug}`} label="Start the request" />
    </>
  );
}
