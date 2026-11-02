import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Photo } from '@/components/Photo';
import { Band, Marker, R } from '@/components/editorial';
import { ArticleView } from '@/components/ArticleView';
import { getTimeline } from '@/server/site-content';
import { getRelated, recordView } from '@/server/journal';
import { db } from '@/server/db';
import { pageMetadata } from '@/server/seo';
import { GEEPEE_SLUG } from '@/content/seed-platform';

export const dynamic = 'force-dynamic';
const find = () => db.article.findFirst({ where: { slug: GEEPEE_SLUG, status: 'PUBLISHED' }, include: { category: true, author: { select: { name: true } } } });

export async function generateMetadata() {
  const a = await find();
  return a ? pageMetadata('/partnerships/geepee-tanks', { title: a.seoTitle || a.title, description: a.seoDescription || a.excerpt, image: a.featuredImageKey, type: 'article', publishedTime: a.publishedAt, authors: [a.author.name] }) : {};
}

/** The long-form partnership feature. It exists on the site only once staff have published it (and it cannot be published with unfinished placeholders). */
export default async function GeePeePage() {
  const a = await find();
  if (!a) notFound();
  const [entries, related] = await Promise.all([getTimeline('geepee'), getRelated(a.id, a.categoryId)]);
  await recordView(a.id);
  const milestones = entries.filter((e) => e.kind === 'MILESTONE');
  const voices = entries.filter((e) => e.kind === 'TESTIMONIAL' || e.kind === 'INTERVIEW');
  return (
    <ArticleView a={a} related={related}>
      {milestones.length > 0 && (
        <section className="mt-20 -mx-0 max-w-3xl" aria-labelledby="ms-h">
          <Marker n="◆" label="Milestones" />
          <h2 id="ms-h" className="mt-6 !text-[clamp(1.8rem,3vw,2.4rem)]">Milestones <em>along the way.</em></h2>
          <ol className="timeline mt-10">{milestones.map((m) => <li key={m.id}>{m.period && <p className="mono text-sm text-ember">{m.period}</p>}<h3 className="serif !text-[1.00rem] mt-1">{m.title}</h3>{m.body && <p className="mt-2 text-steel">{m.body}</p>}</li>)}</ol>
        </section>
      )}
      {voices.length > 0 && (
        <section className="mt-20 max-w-3xl space-y-12" aria-label="In their words">
          <Marker n="◆" label="In their words" />
          {voices.map((v) => <figure key={v.id}><blockquote className="pullquote">{v.body}</blockquote><figcaption className="caption !mt-4">{v.attribution}{v.period ? ` · ${v.period}` : ''}</figcaption></figure>)}
        </section>
      )}
      <section className="mt-20 max-w-5xl" aria-label="Photographs">
        <Marker n="◆" label="Photographs" />
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">{['tank-black-4', 'tank-black-5', 'tank-black-6'].map((k) => <li key={k}><Photo name={k} className="aspect-[3/4] border border-line" sizes="(min-width: 640px) 30vw, 100vw" /></li>)}</ul>
      </section>
      <section className="mt-20 max-w-3xl border-t-2 border-charcoal pt-8">
        <p className="serif text-2xl">See the range, or start a conversation of your own.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/catalogue/water-storage-tanks" className="btn btn-primary">Water storage tanks <Icon name="arrow" size={18} /></Link>
          <Link href="/request?service=partnership-proposal" className="btn btn-outline">Propose a partnership</Link>
        </div>
      </section>
    </ArticleView>
  );
}
