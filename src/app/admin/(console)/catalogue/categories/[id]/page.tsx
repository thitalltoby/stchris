import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/server/rbac';
import { db } from '@/server/db';
import { PageHeader } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { GROUP_ORDER } from '@/server/catalogue';
import { photoOptions } from '@/server/media';
import { saveCategoryAction, deleteCategoryAction } from '../../actions';

export const metadata = { title: 'Edit category' };

export default async function CategoryEdit({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff('catalogue.manage');
  const c = await db.category.findUnique({ where: { id: (await params).id }, include: { _count: { select: { products: true } } } });
  if (!c) notFound();
  const photos = await photoOptions();
  const groups = [...new Set([...GROUP_ORDER, c.groupLabel])];
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/admin/catalogue">← Catalogue</Link></p>
      <PageHeader title={c.name} eyebrow="Category" actions={<a href={`/catalogue/${c.slug}`} target="_blank" rel="noopener" className="btn btn-outline">View on website</a>} />
      <ActionForm action={saveCategoryAction} className="grid gap-4 max-w-3xl">
        <input type="hidden" name="id" value={c.id} />
        <Field name="name" label="Name" defaultValue={c.name} required /><Field name="slug" label="Web address (slug)" defaultValue={c.slug} />
        <Field name="groupLabel" type="select" label="Group" defaultValue={c.groupLabel} options={groups.map((g) => ({ value: g, label: g }))} />
        <Field name="summary" label="One-line summary" defaultValue={c.summary} required />
        <Field name="description" type="textarea" rows={6} label="Description (Markdown)" defaultValue={c.description} />
        <Field name="range" type="textarea" rows={8} label="What we supply (one line each)" defaultValue={(Array.isArray(c.range) ? (c.range as string[]) : []).join('\n')} hint="Each line becomes a button visitors can add to their project list." />
        <Field name="imageKey" type="select" label="Photo" defaultValue={c.imageKey ?? ''} options={photos} />
        <Field name="sortOrder" type="number" label="Order" defaultValue={c.sortOrder} /><Field name="visible" type="checkbox" label="Visible on the website" defaultValue={c.visible} />
        <SubmitButton>Save category</SubmitButton>
      </ActionForm>
      <ActionForm action={deleteCategoryAction} className="mt-8"><input type="hidden" name="id" value={c.id} /><SubmitButton className="btn btn-danger btn-sm" pending="Deleting…">Delete category</SubmitButton><p className="hint mt-2">{c._count.products > 0 ? `This category has ${c._count.products} product(s); move or delete them first.` : 'Only an empty category can be deleted. You can also hide it.'}</p></ActionForm>
    </>
  );
}
