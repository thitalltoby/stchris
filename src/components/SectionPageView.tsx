import Link from 'next/link';
import { PageHero, Section, RequestCta } from './blocks';
import { Icon } from './Icon';
import { getSectionContent, listSectionDocuments } from '@/server/section-pages';
import { fmtDate, fmtBytes } from '@/lib/format';

/** One template for the editable company pages. The text comes from the console, with draft copy until it is edited. */
export async function SectionPageView({ path }: { path: string }) {
  const content = await getSectionContent(path);
  if (!content) return null;
  const { def } = content;
  const docs = def.documents ? await listSectionDocuments(path) : [];
  return (
    <>
      <PageHero eyebrow={def.eyebrow} title={def.title} photo={content.photo}>
        <p>{content.intro}</p>
      </PageHero>
      <Section>
        <div className="grid gap-14 lg:grid-cols-[1fr_19rem] lg:gap-x-20 items-start">
          <div className="min-w-0 space-y-10">
            <div className="prose-eu" dangerouslySetInnerHTML={{ __html: content.html }} />
            {docs.length > 0 && (
              <div>
                <h2 className="!text-[1.6rem] mb-6">Downloads</h2>
                <ul className="divide-y divide-line border-y border-line max-w-2xl">
                  {docs.map((d) => (
                    <li key={d.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0"><p className="font-medium">{d.title ?? d.originalName}</p><p className="text-sm text-steel">PDF · {fmtBytes(d.sizeBytes)} · Added {fmtDate(d.createdAt)}</p></div>
                      <a href={`/documents/${d.id}`} className="btn btn-outline btn-sm flex-none" target="_blank" rel="noopener noreferrer"><Icon name="download" size={16} />Open</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <aside className="space-y-6 lg:sticky lg:top-28" aria-label="Next steps">
            <div className="border-t-2 border-ember pt-5">
              <h2 className="!text-base mb-2">Ready to start?</h2>
              <p className="text-sm text-steel mb-4">Build a project list and get a written quotation.</p>
              <Link href="/list" className="btn btn-primary btn-sm">Open my project list</Link>
            </div>
            <div className="border-t-2 border-charcoal pt-5">
              <h2 className="!text-base mb-2">Questions?</h2>
              <p className="text-sm text-steel mb-4">Talk to the team.</p>
              <Link href="/contact" className="btn btn-outline btn-sm">Contact us</Link>
            </div>
          </aside>
        </div>
      </Section>
      <RequestCta />
    </>
  );
}
