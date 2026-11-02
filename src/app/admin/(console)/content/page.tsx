import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { db } from '@/server/db';
import { PageHeader, Badge } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { saveFaqAction, deleteFaqAction } from './actions';

export const metadata = { title: 'Content' };

export default async function ContentAdmin() {
  await requireStaff('content.manage');
  const faqs = await db.faq.findMany({ orderBy: { sortOrder: 'asc' } });
  return (
    <>
      <PageHeader title="Content" eyebrow="Pages, photos and FAQs" actions={<span className="flex gap-3"><Link href="/admin/content/pages" className="btn btn-outline">Company pages</Link><Link href="/admin/content/photos" className="btn btn-outline">Photos</Link></span>} />
      <section><h2 className="!text-lg mb-3">Frequently asked questions</h2>
        <div className="space-y-3">{faqs.map((f) => (
          <details key={f.id} className="panel"><summary className="cursor-pointer px-4 py-3 font-medium">{f.question}{!f.visible && <span className="ml-2"><Badge>Hidden</Badge></span>}</summary>
            <div className="p-4 border-t border-line"><ActionForm action={saveFaqAction} className="space-y-3"><input type="hidden" name="id" value={f.id} /><Field name="question" label="Question" defaultValue={f.question} required /><Field name="answer" type="textarea" label="Answer" defaultValue={f.answer} required /><Field name="sortOrder" type="number" label="Order" defaultValue={f.sortOrder} /><Field name="visible" type="checkbox" label="Visible" defaultValue={f.visible} /><SubmitButton className="btn btn-outline btn-sm">Save</SubmitButton></ActionForm>
              <ActionForm action={deleteFaqAction} className="mt-3"><input type="hidden" name="id" value={f.id} /><SubmitButton className="btn btn-danger btn-sm">Delete</SubmitButton></ActionForm></div></details>
        ))}</div>
        <details className="panel panel-pad mt-4"><summary className="cursor-pointer font-display font-bold">Add a question</summary>
          <ActionForm action={saveFaqAction} resetOnSuccess className="mt-4 space-y-3 max-w-2xl"><Field name="question" label="Question" required /><Field name="answer" type="textarea" label="Answer" required /><Field name="sortOrder" type="number" label="Order" defaultValue={faqs.length} /><Field name="visible" type="checkbox" label="Visible" defaultValue /><SubmitButton>Add</SubmitButton></ActionForm></details>
      </section>
    </>
  );
}
