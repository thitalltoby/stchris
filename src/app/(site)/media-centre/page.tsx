import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Photo } from '@/components/Photo';
import { PageHead, Band, R } from '@/components/editorial';
import { VideoEmbed } from '@/components/ArticleView';
import { getMediaItems, MEDIA_KINDS } from '@/server/site-content';
import { renderMarkdown } from '@/server/markdown';
import { pageMetadata } from '@/server/seo';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => pageMetadata('/media-centre', { title: 'Media centre', description: 'Press releases, interviews, speaking engagements, conference appearances, announcements, industry commentary, galleries and media mentions for Chris Iyoha and St. Chris Global.' });

const SECTIONS: { id: string; title: React.ReactNode; kinds: string[] }[] = [
  { id: 'news', title: <>Press releases <em>and announcements.</em></>, kinds: ['PRESS_RELEASE', 'ANNOUNCEMENT'] },
  { id: 'interviews', title: <>Interviews <em>and publications.</em></>, kinds: ['INTERVIEW', 'PUBLICATION'] },
  { id: 'speaking', title: <>Speaking <em>and conferences.</em></>, kinds: ['SPEAKING', 'CONFERENCE'] },
  { id: 'commentary', title: <>Industry <em>commentary.</em></>, kinds: ['COMMENTARY'] },
  { id: 'mentions', title: <>In <em>the media.</em></>, kinds: ['MENTION'] },
];

export default async function MediaCentre() {
  const all = await getMediaItems();
  const gallery = all.filter((m) => m.kind === 'PHOTO' || m.kind === 'VIDEO');
  let n = 1;
  return (
    <>
      <PageHead marker="Media centre" n="01" photo="boardroom-presenter" title={<>On the record, <em>in one place.</em></>} lead={<p>Press releases, interviews, appearances and galleries for Chris Iyoha and St. Chris Global.</p>}>
        <Link href="/request?service=media-speaking" className="btn btn-dark">Media or speaking request <Icon name="arrow" size={18} /></Link>
      </PageHead>
      {all.length === 0 && (
        <Band marker="Nothing published yet" tone="white">
          <p className="serif text-2xl max-w-2xl">Press and appearances will be listed here as they happen.</p>
          <p className="mt-4 text-steel max-w-xl">Journalists and event organisers can reach the communications team with the request form.</p>
        </Band>
      )}
      {SECTIONS.map((s) => {
        const items = all.filter((m) => s.kinds.includes(m.kind));
        if (!items.length) return null;
        n++;
        return (
          <Band key={s.id} id={s.id} n={`0${n}`} marker={s.kinds.map((k) => MEDIA_KINDS[k]).join(' · ')} tone={n % 2 ? 'ivory' : 'white'} title={s.title}>
            <ul className="border-t border-line">
              {items.map((m) => (
                <li key={m.id} className="py-7 border-b border-line grid gap-3 md:grid-cols-[11rem_1fr] md:gap-10">
                  <div className="mono text-sm text-steel"><p>{fmtDate(m.eventDate ?? m.createdAt)}</p><p className="mt-1"><span className="tag">{MEDIA_KINDS[m.kind]}</span></p></div>
                  <div>
                    <h3 className="serif !text-[1.00rem]">{m.url ? <a href={m.url} rel="noopener noreferrer" className="u-link">{m.title}<span className="sr-only"> (opens a new site)</span></a> : m.title}</h3>
                    {(m.source || m.location) && <p className="mt-1 text-sm text-steel">{[m.source, m.location].filter(Boolean).join(' · ')}</p>}
                    {m.summary && <p className="mt-3 text-steel max-w-2xl">{m.summary}</p>}
                    {m.videoUrl && <div className="mt-5 max-w-2xl"><VideoEmbed url={m.videoUrl} title={m.title} /></div>}
                    {m.body && <details className="mt-4"><summary className="cursor-pointer font-semibold text-ember">Read the full text</summary><div className="prose-ed mt-4" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.body) }} /></details>}
                  </div>
                </li>
              ))}
            </ul>
          </Band>
        );
      })}
      {gallery.length > 0 && (
        <Band id="gallery" n={`0${n + 1}`} marker="Photo and video gallery" title={<>The <em>gallery.</em></>}>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((m, i) => (
              <li key={m.id}><R delay={(i % 3) * 80}>
                {m.kind === 'VIDEO' && m.videoUrl ? <VideoEmbed url={m.videoUrl} title={m.title} /> : <Photo name={m.imageKey} alt={m.title} className="aspect-[4/3]" sizes="(min-width: 1024px) 30vw, 100vw" />}
                <p className="caption !text-[.8rem]">{m.title}{m.summary ? `: ${m.summary}` : ''}</p>
              </R></li>
            ))}
          </ul>
        </Band>
      )}
    </>
  );
}
