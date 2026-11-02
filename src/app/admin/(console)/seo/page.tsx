import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { getSetting } from '@/server/settings';
import { photoOptions } from '@/server/media';
import { listSeo } from '@/server/site-content';
import { env } from '@/server/env';
import { PageHeader, Badge, Alert } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { PhotoPicker } from '@/components/PhotoPicker';
import { saveSeoAction, saveSeoSettingsAction } from './actions';

export const metadata = { title: 'SEO and sharing' };
const PAGES = ['/', '/chris-iyoha', '/leadership', '/divisions', '/opportunities', '/journal', '/media-centre', '/partnerships/geepee-tanks', '/request', '/contact', '/catalogue'];

export default async function SeoAdmin() {
  await requireStaff('seo.manage');
  const [seo, entries, photos] = await Promise.all([getSetting('seo'), listSeo(), photoOptions()]);
  return (
    <>
      <PageHeader title="SEO and sharing" eyebrow="Visibility"><p>How pages appear in search results and when shared on WhatsApp, LinkedIn, Facebook and X. Articles have their own search fields in the article editor.</p></PageHeader>

      <section className="panel panel-pad max-w-2xl mb-8" aria-labelledby="gs-h">
        <h2 id="gs-h" className="!text-lg mb-3">Google Search Console and defaults</h2>
        <ActionForm action={saveSeoSettingsAction} className="grid gap-4">
          <Field name="searchConsoleToken" label="Search Console verification code" defaultValue={seo.searchConsoleToken} hint="In Search Console choose Add property → URL prefix → HTML tag, then paste only the code from content=“…”." />
          <PhotoPicker name="defaultShareImage" label="Default share picture" options={photos} defaultValue={seo.defaultShareImage} hint="Used when a page has no picture of its own." />
          <div><SubmitButton pending="Saving…">Save</SubmitButton></div>
        </ActionForm>
        <ul className="mt-5 text-sm text-steel space-y-1 border-t border-line pt-4">
          <li>Sitemap for Search Console: <a href={`${env.APP_URL}/sitemap.xml`}>{env.APP_URL}/sitemap.xml</a></li>
          <li>Crawler rules: <a href="/robots.txt">/robots.txt</a>. The staff area and customer areas are kept out of search results.</li>
          <li>Google Analytics 4 is set up under <Link href="/admin/integrations">Integrations → Analytics</Link>. It loads only after a visitor accepts the cookie notice.</li>
        </ul>
      </section>

      <section aria-labelledby="pg-h" className="mb-8">
        <h2 id="pg-h" className="!text-lg mb-3">Page by page</h2>
        <p className="text-sm text-steel mb-4 max-w-2xl">Leave a field blank to keep the page’s built-in wording. Clearing everything on a page removes your override.</p>
        <ul className="grid gap-3 mb-6">
          {entries.map((e) => (
            <li key={e.path} className="panel"><details><summary className="p-4 cursor-pointer flex flex-wrap items-center gap-2 min-h-[2.75rem]"><span className="mono font-semibold">{e.path}</span>{e.noindex && <Badge tone="warn">Hidden from search</Badge>}<span className="text-sm text-steel">{e.title}</span></summary><div className="p-4 pt-0"><SeoForm photos={photos} entry={e} /></div></details></li>
          ))}
        </ul>
        <details className="panel panel-pad"><summary className="cursor-pointer font-display font-bold min-h-[2.75rem] flex items-center">Set up a page</summary><div className="mt-4"><SeoForm photos={photos} /></div></details>
      </section>
      <Alert tone="info">Page addresses are kept clean and readable (for example /journal/my-article-title). Each page names its own canonical address so search engines do not index duplicates.</Alert>
    </>
  );
}

function SeoForm({ photos, entry }: { photos: { value: string; label: string }[]; entry?: { path: string; title: string | null; description: string | null; ogImageKey: string | null; noindex: boolean } }) {
  return (
    <ActionForm action={saveSeoAction} className="grid gap-4 max-w-2xl">
      {entry ? <><input type="hidden" name="path" value={entry.path} /></> : <><Field name="path" label="Page address" required placeholder="/divisions" hint="Start with /." /><datalist id="seo-pages">{PAGES.map((p) => <option key={p} value={p} />)}</datalist></>}
      <Field name="title" label="Search title" defaultValue={entry?.title ?? ''} maxLength={70} hint="Up to 70 characters." />
      <Field name="description" label="Search description" type="textarea" rows={3} defaultValue={entry?.description ?? ''} hint="Up to 200 characters. This is the sentence under the title in search results." />
      <PhotoPicker name="ogImageKey" label="Share picture" options={photos} defaultValue={entry?.ogImageKey ?? ''} />
      <Field name="noindex" label="Keep this page out of search results" type="checkbox" defaultValue={entry?.noindex ?? false} />
      <div><SubmitButton pending="Saving…">Save</SubmitButton></div>
    </ActionForm>
  );
}
