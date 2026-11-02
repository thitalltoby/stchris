import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { can } from '@/lib/permissions';
import { getSetting } from '@/server/settings';
import { db } from '@/server/db';
import { listPostsAdmin, listStaffDocuments, STAFF_POST_KINDS } from '@/server/staff-portal';
import { PageHeader, Badge, Empty } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { SCAN_LABELS, isServable } from '@/server/scan';
import { fmtDate, fmtBytes } from '@/lib/format';
import { saveStaffPostAction, deleteStaffPostAction, addStaffDocumentAction, removeStaffDocumentAction } from './actions';

export const metadata = { title: 'Staff portal' };
type Post = Awaited<ReturnType<typeof listPostsAdmin>>[number];

export default async function StaffPortalAdmin() {
  const me = await requireStaff('staffportal.manage');
  const [posts, docs, depts, headcount] = await Promise.all([listPostsAdmin(), listStaffDocuments(me), getSetting('departments'), db.user.count({ where: { isActive: true, role: { not: 'CUSTOMER' } } })]);
  const kinds = Object.entries(STAFF_POST_KINDS).map(([value, label]) => ({ value, label }));
  const deptOpts = [{ value: '', label: 'Everyone' }, ...depts.map((d) => ({ value: d.key, label: d.label }))];
  return (
    <>
      <PageHeader title="Staff portal" eyebrow="Internal" actions={<Link href="/staff" className="btn btn-outline">Open the staff portal</Link>}>
        <p>Announcements, circulars and approved documents for the {headcount} active staff accounts. {can(me.role, 'user.manage') ? <>Add people and set roles under <Link href="/admin/users">Users and roles</Link>.</> : 'Accounts and roles are managed by an administrator.'}</p>
      </PageHeader>

      <section aria-labelledby="posts-h" className="mb-12">
        <h2 id="posts-h" className="!text-xl mb-3">Announcements and circulars</h2>
        {posts.length === 0 ? <Empty title="Nothing posted yet" /> : (
          <ul className="grid gap-3 mb-6">
            {posts.map((p) => (
              <li key={p.id} className="panel"><details>
                <summary className="p-4 cursor-pointer flex flex-wrap items-center gap-2 min-h-[2.75rem]"><Badge tone={p.status === 'PUBLISHED' ? 'good' : 'neutral'}>{p.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Badge><Badge>{STAFF_POST_KINDS[p.kind]}</Badge>{p.pinned && <Badge tone="info">Pinned</Badge>}<span className="font-semibold">{p.title}</span><span className="text-sm text-steel">{p._count.reads} read</span></summary>
                <div className="p-4 pt-0"><PostForm kinds={kinds} deptOpts={deptOpts} p={p} />
                  <ActionForm action={deleteStaffPostAction} className="mt-3"><input type="hidden" name="id" value={p.id} /><SubmitButton className="btn btn-danger btn-sm" pending="Deleting…">Delete</SubmitButton></ActionForm></div>
              </details></li>
            ))}
          </ul>
        )}
        <details className="panel panel-pad"><summary className="cursor-pointer font-display font-bold min-h-[2.75rem] flex items-center">Write a post</summary><div className="mt-4"><PostForm kinds={kinds} deptOpts={deptOpts} /></div></details>
      </section>

      <section aria-labelledby="docs-h">
        <h2 id="docs-h" className="!text-xl mb-3">Approved documents</h2>
        <p className="text-sm text-steel max-w-2xl mb-4">Policies, forms and guides. Only signed-in staff can open them, and only after the file passes the security scan. Upload only documents that have been approved for staff.</p>
        {docs.length === 0 ? <Empty title="No documents yet" /> : (
          <div className="table-wrap mb-6"><table className="dt"><thead><tr><th>Document</th><th>Category</th><th>For</th><th>File</th><th>Scan</th><th /></tr></thead><tbody>
            {docs.map((d) => (
              <tr key={d.id}><td><span className="font-medium">{d.title}</span>{d.description && <span className="block text-xs text-steel">{d.description}</span>}</td><td>{d.category}</td><td>{depts.find((x) => x.key === d.department)?.label ?? 'Everyone'}</td><td className="text-sm">{d.document.originalName}<br /><span className="text-steel">{fmtBytes(d.document.sizeBytes)} · {fmtDate(d.createdAt)}</span></td><td><Badge tone={isServable(d.document.scanStatus) ? 'good' : 'warn'}>{SCAN_LABELS[d.document.scanStatus]}</Badge></td>
                <td><ActionForm action={removeStaffDocumentAction}><input type="hidden" name="id" value={d.id} /><SubmitButton className="btn btn-danger btn-sm" pending="Removing…">Remove</SubmitButton></ActionForm></td></tr>
            ))}
          </tbody></table></div>
        )}
        <details className="panel panel-pad"><summary className="cursor-pointer font-display font-bold min-h-[2.75rem] flex items-center">Add a document</summary>
          <ActionForm action={addStaffDocumentAction} resetOnSuccess encType="multipart/form-data" className="grid gap-4 max-w-2xl mt-4">
            <Field name="file" type="file" label="File" required accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png" hint="PDF, Word, Excel, PowerPoint or a picture." />
            <Field name="title" label="Title" required /><Field name="description" label="Short description" />
            <div className="grid gap-4 sm:grid-cols-2"><Field name="category" label="Category" placeholder="Policies, Forms, Training…" /><Field name="department" label="Who can see it" type="select" options={deptOpts} /></div>
            <div><SubmitButton pending="Uploading…">Add document</SubmitButton></div>
          </ActionForm></details>
      </section>
    </>
  );
}

function PostForm({ kinds, deptOpts, p }: { kinds: { value: string; label: string }[]; deptOpts: { value: string; label: string }[]; p?: Post }) {
  return (
    <ActionForm action={saveStaffPostAction} resetOnSuccess={!p} className="grid gap-4 max-w-2xl">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-4 sm:grid-cols-2"><Field name="kind" label="Type" type="select" options={kinds} defaultValue={p?.kind ?? 'ANNOUNCEMENT'} /><Field name="department" label="Who sees it" type="select" options={deptOpts} defaultValue={p?.department ?? ''} /></div>
      <Field name="title" label="Title" required defaultValue={p?.title ?? ''} />
      <Field name="body" label="Message" type="textarea" rows={8} required defaultValue={p?.body ?? ''} hint="Blank line between paragraphs." />
      <Field name="pinned" label="Pin to the top" type="checkbox" defaultValue={p?.pinned ?? false} />
      <Field name="publish" label="Publish to staff now" type="checkbox" defaultValue={p?.status === 'PUBLISHED'} />
      <div><SubmitButton pending="Saving…">{p ? 'Save changes' : 'Save post'}</SubmitButton></div>
    </ActionForm>
  );
}
