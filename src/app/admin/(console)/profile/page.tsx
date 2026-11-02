import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { getSetting } from '@/server/settings';
import { photoOptions } from '@/server/media';
import { listTimelineAdmin, TIMELINE_KINDS } from '@/server/site-content';
import { PageHeader, Badge, Empty, Alert } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { PhotoPicker } from '@/components/PhotoPicker';
import { saveExecutiveAction, saveTimelineAction, deleteTimelineAction } from './actions';

export const metadata = { title: 'Executive profile' };

export default async function ProfileAdmin({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  await requireStaff('profile.manage');
  const scope = (await searchParams).scope === 'geepee' ? 'geepee' : 'chris';
  const [ex, photos, entries] = await Promise.all([getSetting('executive'), photoOptions(), listTimelineAdmin(scope)]);
  const kinds = Object.entries(TIMELINE_KINDS).map(([value, label]) => ({ value, label }));
  const sec = [0, 1, 2, 3, 4].map((i) => ex.sections[i] ?? { id: '', title: '', body: '' });
  const pr = [0, 1, 2, 3].map((i) => ex.principles[i] ?? { title: '', body: '' });
  return (
    <>
      <PageHeader title="Executive profile" eyebrow="Chris Iyoha"><p>The words and pictures on the Chris Iyoha page, the Leadership, Career &amp; Opportunities page and the GeePee Tanks feature.</p></PageHeader>
      <div className="mb-6 max-w-3xl"><Alert tone="warn">The profile text now on the site was written from the project brief only. It contains no dates, employers or titles, because none were supplied. Replace it with Chris’s approved biography before launch.</Alert></div>

      <section className="panel panel-pad max-w-3xl mb-10" aria-labelledby="ex-h">
        <h2 id="ex-h" className="!text-lg mb-4">Profile</h2>
        <ActionForm action={saveExecutiveAction} className="grid gap-4">
          <Field name="headline" label="Headline" required defaultValue={ex.headline} />
          <Field name="strapline" label="Strapline" defaultValue={ex.strapline} />
          <PhotoPicker name="portraitKey" label="Portrait" options={photos} defaultValue={ex.portraitKey} hint="Shown on the profile page and as the default share picture." />
          <fieldset className="grid gap-4"><legend className="font-display font-bold mb-1">Story sections</legend>
            {sec.map((s, i) => (
              <div key={i} className="border border-line p-3 grid gap-3">
                <input type="hidden" name={`sid${i}`} value={s.id} />
                <Field name={`stitle${i}`} label={`Section ${i + 1} heading`} defaultValue={s.title} />
                <Field name={`sbody${i}`} label="Text" type="textarea" rows={6} defaultValue={s.body} hint="Leave both blank to remove a section. Blank lines start a new paragraph." />
              </div>
            ))}
          </fieldset>
          <fieldset className="grid gap-4"><legend className="font-display font-bold mb-1">Principles (optional)</legend>
            {pr.map((p, i) => (
              <div key={i} className="border border-line p-3 grid gap-3">
                <Field name={`ptitle${i}`} label={`Principle ${i + 1} title`} defaultValue={p.title} />
                <Field name={`pbody${i}`} label="Explanation" type="textarea" rows={3} defaultValue={p.body} />
              </div>
            ))}
          </fieldset>
          <Field name="closing" label="Closing line" defaultValue={ex.closing} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="linkedin" label="LinkedIn address" placeholder="https://" defaultValue={ex.linkedin} />
            <Field name="x" label="X address" placeholder="https://" defaultValue={ex.x} />
            <Field name="instagram" label="Instagram address" placeholder="https://" defaultValue={ex.instagram} />
            <Field name="facebook" label="Facebook address" placeholder="https://" defaultValue={ex.facebook} />
          </div>
          <div><SubmitButton pending="Saving…">Save profile</SubmitButton></div>
        </ActionForm>
      </section>

      <section aria-labelledby="tl-h">
        <h2 id="tl-h" className="!text-lg mb-3">{scope === 'chris' ? 'Career, leadership and training entries' : 'GeePee Tanks milestones, testimonials and interviews'}</h2>
        <nav aria-label="Which timeline" className="flex gap-2 mb-4">
          <Link className="chip" href="/admin/profile" aria-current={scope === 'chris' ? 'true' : undefined}>Chris Iyoha</Link>
          <Link className="chip" href="/admin/profile?scope=geepee" aria-current={scope === 'geepee' ? 'true' : undefined}>GeePee Tanks feature</Link>
        </nav>
        <p className="text-sm text-steel mb-4 max-w-2xl">Only add what is true and approved. Entries appear on the public page in this order, lowest number first. Nothing is shown until you add it.</p>
        {entries.length === 0 ? <Empty title="No entries yet" /> : (
          <ul className="grid gap-3 mb-6">
            {entries.map((e) => (
              <li key={e.id} className="panel">
                <details>
                  <summary className="p-4 cursor-pointer flex flex-wrap gap-2 items-center min-h-[2.75rem]"><Badge tone={e.visible ? 'good' : 'neutral'}>{e.visible ? 'Shown' : 'Hidden'}</Badge><Badge>{TIMELINE_KINDS[e.kind] ?? e.kind}</Badge><span className="font-semibold">{e.title}</span><span className="text-sm text-steel">{e.period}</span></summary>
                  <div className="p-4 pt-0"><TimelineForm scope={scope} kinds={kinds} photos={photos} entry={e} />
                    <ActionForm action={deleteTimelineAction} className="mt-3"><input type="hidden" name="id" value={e.id} /><SubmitButton className="btn btn-danger btn-sm" pending="Removing…">Remove this entry</SubmitButton></ActionForm></div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <details className="panel panel-pad"><summary className="cursor-pointer font-display font-bold min-h-[2.75rem] flex items-center">Add an entry</summary><div className="mt-4"><TimelineForm scope={scope} kinds={kinds} photos={photos} /></div></details>
      </section>
    </>
  );
}

function TimelineForm({ scope, kinds, photos, entry }: { scope: string; kinds: { value: string; label: string }[]; photos: { value: string; label: string }[]; entry?: { id: string; kind: string; period: string | null; title: string; body: string | null; attribution: string | null; imageKey: string | null; sortOrder: number; visible: boolean } }) {
  return (
    <ActionForm action={saveTimelineAction} resetOnSuccess={!entry} className="grid gap-4 max-w-2xl">
      {entry && <input type="hidden" name="id" value={entry.id} />}<input type="hidden" name="scope" value={scope} />
      <div className="grid gap-4 sm:grid-cols-2"><Field name="kind" label="Type" type="select" options={kinds} defaultValue={entry?.kind ?? (scope === 'geepee' ? 'MILESTONE' : 'CAREER')} /><Field name="period" label="When" placeholder="Year or period" defaultValue={entry?.period ?? ''} /></div>
      <Field name="title" label="Title" required defaultValue={entry?.title ?? ''} />
      <Field name="body" label="Details, or the words said" type="textarea" rows={5} defaultValue={entry?.body ?? ''} />
      <Field name="attribution" label="Who said it (testimonials)" defaultValue={entry?.attribution ?? ''} />
      <PhotoPicker name="imageKey" label="Photo (optional)" options={photos} defaultValue={entry?.imageKey ?? ''} />
      <div className="grid gap-4 sm:grid-cols-2"><Field name="sortOrder" label="Order" type="number" min={0} defaultValue={entry?.sortOrder ?? 0} /><Field name="visible" label="Show on the site" type="checkbox" defaultValue={entry?.visible ?? true} /></div>
      <div><SubmitButton pending="Saving…">{entry ? 'Save changes' : 'Add entry'}</SubmitButton></div>
    </ActionForm>
  );
}
