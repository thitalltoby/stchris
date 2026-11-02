import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/server/rbac';
import { db } from '@/server/db';
import { PageHeader, Badge } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { photoOptions } from '@/server/media';
import { getSetting } from '@/server/settings';
import { saveServiceAction, saveFieldAction, deleteFieldAction } from '../actions';

export const metadata = { title: 'Edit service' };

const TYPES = ['TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'DATE', 'BOOLEAN'].map((t) => ({ value: t, label: { TEXT: 'Short text', TEXTAREA: 'Long text', NUMBER: 'Number', SELECT: 'Choice list', DATE: 'Date', BOOLEAN: 'Yes / no' }[t]! }));

export default async function ServiceEdit({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff('service.manage');
  const { id } = await params;
  const s = await db.service.findUnique({ where: { id }, include: { fields: { orderBy: { sortOrder: 'asc' } } } });
  if (!s) notFound();
  const photos = await photoOptions();
  const depts = await getSetting('departments');
  const highlights = Array.isArray(s.highlights) ? (s.highlights as string[]).join('\n') : '';
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/admin/services">← All services</Link></p>
      <PageHeader title={s.name} eyebrow="Service" actions={<Link className="btn btn-outline" href={`/services/${s.slug}`} target="_blank">View public page</Link>}>
        {s.needsReview && <p><Badge tone="warn">Drawn from company materials. Saving marks it as reviewed.</Badge></p>}
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel panel-pad"><h2 className="!text-lg mb-4">Public page</h2>
          <ActionForm action={saveServiceAction} className="space-y-4"><input type="hidden" name="id" value={s.id} />
            <Field name="name" label="Name" defaultValue={s.name} required /><Field name="slug" label="Web address (slug)" defaultValue={s.slug} /><Field name="pillar" label="Group" defaultValue={s.pillar} required /><Field name="department" label="Enquiries go to" type="select" defaultValue={s.department} options={depts.map((d) => ({ value: d.key, label: d.label }))} /><Field name="acceptsItems" type="checkbox" label="Carries the customer’s project list (items and quantities)" defaultValue={s.acceptsItems} />
            <Field name="summary" type="textarea" rows={2} label="Summary" defaultValue={s.summary} required /><Field name="description" type="textarea" rows={10} label="Description (Markdown)" defaultValue={s.description} required />
            <Field name="highlights" type="textarea" rows={4} label="Highlights (one per line)" defaultValue={highlights} /><Field name="instructions" type="textarea" rows={2} label="Instructions shown in the request form" defaultValue={s.instructions} />
            <div className="grid grid-cols-2 gap-4"><Field name="icon" label="Icon" defaultValue={s.icon} hint="truck, anchor, waves, layers, road, ship, container" /><Field name="sortOrder" type="number" label="Order" defaultValue={s.sortOrder} /></div>
            <Field name="imageKey" type="select" label="Photo" defaultValue={s.imageKey ?? ''} options={photos} hint="From the supplied photographs or your uploads (Content → Photos)." /><Field name="visible" type="checkbox" label="Visible and open for requests" defaultValue={s.visible} /><SubmitButton>Save service</SubmitButton></ActionForm>
        </section>
        <section className="panel panel-pad"><h2 className="!text-lg mb-1">Request form fields</h2><p className="text-sm text-steel mb-4">The questions asked once this service is chosen. Fields with keys <code className="mono">origin</code>, <code className="mono">destination</code>, <code className="mono">quantity</code>, <code className="mono">unit</code>, <code className="mono">start_date</code> and <code className="mono">end_date</code> also feed the request summary and dates.</p>
          <div className="space-y-3">{s.fields.map((f) => (
            <details key={f.id} className="border border-line bg-white"><summary className="cursor-pointer px-3 py-2.5 flex justify-between gap-3"><span><strong>{f.label}</strong> <span className="mono text-xs text-steel">{f.key} · {f.type}{f.required ? ' · required' : ''}</span></span>{!f.visible && <Badge>Hidden</Badge>}</summary>
              <div className="p-3 border-t border-line"><FieldForm serviceId={s.id} f={f} />
                <ActionForm action={deleteFieldAction} className="mt-3"><input type="hidden" name="serviceId" value={s.id} /><input type="hidden" name="fieldId" value={f.id} /><SubmitButton className="btn btn-danger btn-sm">Remove field</SubmitButton></ActionForm></div></details>
          ))}</div>
          <details className="mt-4"><summary className="cursor-pointer font-display font-bold text-ember">Add a field</summary><div className="mt-3"><FieldForm serviceId={s.id} /></div></details>
        </section>
      </div>
    </>
  );
}

function FieldForm({ serviceId, f }: { serviceId: string; f?: { id: string; key: string; label: string; type: string; required: boolean; options: unknown; unit: string | null; helpText: string | null; placeholder: string | null; section: string; sortOrder: number; visible: boolean } }) {
  const opts = Array.isArray(f?.options) ? (f!.options as string[]).join('\n') : '';
  return (
    <ActionForm action={saveFieldAction} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="serviceId" value={serviceId} />{f && <input type="hidden" name="fieldId" value={f.id} />}
      <Field name="label" label="Question" defaultValue={f?.label} required /><Field name="key" label="Key" defaultValue={f?.key} required hint="Lowercase, e.g. cargo_type. Do not change after requests exist." />
      <Field name="type" type="select" label="Answer type" defaultValue={f?.type ?? 'TEXT'} options={TYPES} /><Field name="section" label="Section heading" defaultValue={f?.section ?? 'Requirement'} />
      <Field name="options" type="textarea" rows={3} label="Choices (one per line, for choice lists)" defaultValue={opts} className="sm:col-span-2" />
      <Field name="unit" label="Unit (numbers)" defaultValue={f?.unit} /><Field name="sortOrder" type="number" label="Order" defaultValue={f?.sortOrder ?? 100} />
      <Field name="helpText" label="Help text" defaultValue={f?.helpText} className="sm:col-span-2" /><Field name="placeholder" label="Placeholder" defaultValue={f?.placeholder} className="sm:col-span-2" />
      <Field name="required" type="checkbox" label="Required" defaultValue={f?.required} /><Field name="visible" type="checkbox" label="Visible" defaultValue={f?.visible ?? true} />
      <div className="sm:col-span-2"><SubmitButton className="btn btn-outline btn-sm">{f ? 'Save field' : 'Add field'}</SubmitButton></div>
    </ActionForm>
  );
}
