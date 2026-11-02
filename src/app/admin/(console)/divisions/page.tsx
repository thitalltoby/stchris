import { requireStaff } from '@/server/rbac';
import { db } from '@/server/db';
import { photoOptions } from '@/server/media';
import { listDivisionsAdmin } from '@/server/site-content';
import { PageHeader, Badge, Alert } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { PhotoPicker } from '@/components/PhotoPicker';
import { saveDivisionAction } from './actions';

export const metadata = { title: 'Business divisions' };
const ICONS = ['container', 'waves', 'layers', 'truck', 'ship', 'anchor', 'road', 'briefcase', 'shield', 'users'];

type Div = Awaited<ReturnType<typeof listDivisionsAdmin>>[number];

export default async function DivisionsAdmin() {
  await requireStaff('division.manage');
  const [divs, photos, services, cats] = await Promise.all([listDivisionsAdmin(), photoOptions(), db.service.findMany({ where: { visible: true }, orderBy: { name: 'asc' }, select: { slug: true, name: true } }), db.category.findMany({ orderBy: { name: 'asc' }, select: { slug: true, name: true } })]);
  const serviceOpts = [{ value: '', label: 'No enquiry button' }, ...services.map((s) => ({ value: s.slug, label: s.name }))];
  return (
    <>
      <PageHeader title="Business divisions" eyebrow="Corporate"><p>Each division has its own page with pictures, product categories and an enquiry button.</p></PageHeader>
      <div className="mb-6 max-w-3xl"><Alert tone="warn">Division descriptions were written from the project brief, not from St. Chris’s own wording. Tick “still needs review” until you have checked each one, and confirm any claim about distributorships or brands before it goes live.</Alert></div>
      <ul className="grid gap-3 mb-8">
        {divs.map((d) => (
          <li key={d.id} className="panel">
            <details>
              <summary className="p-4 cursor-pointer flex flex-wrap gap-2 items-center min-h-[2.75rem]"><Badge tone={d.visible ? 'good' : 'neutral'}>{d.visible ? 'Shown' : 'Hidden'}</Badge>{d.needsReview && <Badge tone="warn">Needs review</Badge>}<span className="font-semibold">{d.name}</span></summary>
              <div className="p-4 pt-0"><DivisionForm d={d} photos={photos} serviceOpts={serviceOpts} cats={cats} /></div>
            </details>
          </li>
        ))}
      </ul>
      <details className="panel panel-pad"><summary className="cursor-pointer font-display font-bold min-h-[2.75rem] flex items-center">Add a division</summary><div className="mt-4"><DivisionForm photos={photos} serviceOpts={serviceOpts} cats={cats} /></div></details>
    </>
  );
}

function DivisionForm({ d, photos, serviceOpts, cats }: { d?: Div; photos: { value: string; label: string }[]; serviceOpts: { value: string; label: string }[]; cats: { slug: string; name: string }[] }) {
  const chosen = new Set((d?.categorySlugs as string[] | undefined) ?? []);
  return (
    <ActionForm action={saveDivisionAction} resetOnSuccess={!d} className="grid gap-4 max-w-2xl">
      {d && <input type="hidden" name="id" value={d.id} />}
      <Field name="name" label="Name" required defaultValue={d?.name ?? ''} />
      <Field name="slug" label="Page address" defaultValue={d?.slug ?? ''} hint="Leave blank to make it from the name. Changing it breaks old links." />
      <Field name="tagline" label="Tagline" required defaultValue={d?.tagline ?? ''} />
      <Field name="summary" label="Short summary (shown on cards)" type="textarea" rows={2} required defaultValue={d?.summary ?? ''} />
      <Field name="description" label="Full description" type="textarea" rows={8} required defaultValue={d?.description ?? ''} hint="Blank line between paragraphs." />
      <Field name="highlights" label="Highlights" type="textarea" rows={4} defaultValue={((d?.highlights as string[]) ?? []).join('\n')} hint="One per line." />
      <Field name="offerings" label="What it covers" type="textarea" rows={4} defaultValue={((d?.offerings as string[]) ?? []).join('\n')} hint="One per line. Shown as tags." />
      <fieldset><legend className="label">Catalogue categories shown on this page</legend>
        <div className="grid gap-1 sm:grid-cols-2">{cats.map((c) => <label key={c.slug} className="check"><input type="checkbox" name="categorySlugs" value={c.slug} defaultChecked={chosen.has(c.slug)} /><span>{c.name}</span></label>)}</div></fieldset>
      <Field name="serviceSlug" label="Enquiry button opens this request type" type="select" options={serviceOpts} defaultValue={d?.serviceSlug ?? ''} />
      <PhotoPicker name="imageKey" label="Division picture" options={photos} defaultValue={d?.imageKey ?? ''} />
      <div className="grid gap-4 sm:grid-cols-2"><Field name="icon" label="Icon" type="select" options={ICONS.map((i) => ({ value: i, label: i }))} defaultValue={d?.icon ?? 'container'} /><Field name="sortOrder" label="Order" type="number" min={0} defaultValue={d?.sortOrder ?? 0} /></div>
      <Field name="visible" label="Show on the site" type="checkbox" defaultValue={d?.visible ?? true} />
      <Field name="needsReview" label="Text still needs review" type="checkbox" defaultValue={d?.needsReview ?? true} />
      <div><SubmitButton pending="Saving…">{d ? 'Save division' : 'Add division'}</SubmitButton></div>
    </ActionForm>
  );
}
