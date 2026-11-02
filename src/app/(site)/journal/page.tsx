import Link from 'next/link';
import { PageHead, ArticleCard, R } from '@/components/editorial';
import { Pagination, qs } from '@/components/ui';
import { categoriesWithCounts, listPublished } from '@/server/journal';
import { pageMetadata } from '@/server/seo';

export const dynamic = 'force-dynamic';
const PER = 9;
export const generateMetadata = () => pageMetadata('/journal', { title: 'The journal', description: 'Articles by Chris Iyoha and St. Chris Global on leadership, enterprise, industry insight, partnerships and careers.' });

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ page?: string; tag?: string; q?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [cats, { items, total }] = await Promise.all([categoriesWithCounts(), listPublished({ tag: sp.tag, q: sp.q, take: PER, skip: (page - 1) * PER })]);
  const filtered = !!(sp.tag || sp.q);
  const lead = page === 1 && !filtered ? items[0] : undefined;
  const grid = lead ? items.slice(1) : items;
  return (
    <>
      <PageHead marker="The journal" n="01" photo="office-shelving" title={<>Ideas on leadership, enterprise <em>and partnership.</em></>} lead={<p>Written by Chris Iyoha and the St. Chris team.</p>} />
      <section className="bg-white section-tight">
        <div className="container-x">
          <nav aria-label="Categories" className="flex flex-wrap gap-2 mb-6">
            <Link href="/journal" className="chip" aria-current={!filtered ? 'true' : undefined}>All</Link>
            {cats.filter((c) => c.count > 0).map((c) => <Link key={c.id} href={`/journal/category/${c.slug}`} className="chip">{c.name} <span className="mono text-xs ml-2 opacity-60">{c.count}</span></Link>)}
          </nav>
          <form action="/journal" role="search" className="flex max-w-md gap-2 mb-12">
            <label htmlFor="jq" className="sr-only">Search the journal</label>
            <input id="jq" name="q" defaultValue={sp.q} className="input" placeholder="Search the journal" />
            <button className="btn btn-dark" type="submit">Search</button>
          </form>
          {sp.tag && <p className="mb-8 text-steel">Tagged <span className="tag">{sp.tag}</span> · <Link href="/journal">clear</Link></p>}

          {total === 0 ? (
            <div className="border-t border-line py-16 max-w-xl">
              <p className="serif text-2xl">{filtered ? 'Nothing matches that.' : 'The first articles are on their way.'}</p>
              <p className="mt-4 text-steel">{filtered ? 'Try another word, or browse all articles.' : 'Check back soon, or follow St. Chris on social media for new writing as it is published.'}</p>
            </div>
          ) : (
            <>
              {lead && <R className="mb-16 md:mb-20"><ArticleCard a={lead} large /></R>}
              <div className="grid gap-x-10 gap-y-14 md:grid-cols-2 lg:grid-cols-3">{grid.map((a, i) => <R key={a.id} delay={(i % 3) * 90}><ArticleCard a={a} /></R>)}</div>
              <div className="mt-14"><Pagination page={page} pages={Math.max(1, Math.ceil(total / PER))} hrefFor={(p) => `/journal${qs({ page: p > 1 ? p : undefined, tag: sp.tag, q: sp.q })}`} /></div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
