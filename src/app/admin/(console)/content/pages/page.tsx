import { requireStaff } from '@/server/rbac';
import { PageHeader, Badge, Alert } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { SECTION_PAGES } from '@/content/section-pages';
import { getSectionContent, listSectionDocuments } from '@/server/section-pages';
import { SCAN_LABELS } from '@/server/scan';
import { fmtDate } from '@/lib/format';
import { photoOptions } from '@/server/media';
import { savePageAction, resetPageAction, addDocumentAction, removeDocumentAction } from './actions';

export const metadata = { title: 'Section pages' };

export default async function SectionPagesAdmin() {
  await requireStaff('content.manage');
  const photos = await photoOptions();
  const rows = await Promise.all(SECTION_PAGES.map(async (d) => ({ c: (await getSectionContent(d.path))!, docs: d.documents ? await listSectionDocuments(d.path, { includeHeld: true }) : [] })));
  return (
    <>
      <PageHeader title="Section pages" eyebrow="Company pages"><p>Edit the text of About and How quotations work. Pages open with draft copy taken from the corporate profile; edit it once St. Chris has confirmed what it wants to say.</p></PageHeader>
      <div className="mb-6 max-w-3xl"><Alert tone="warn">Review the draft copy before relying on it. It uses only what the corporate profile says (including the 2003 history, which the profile attributes to public company records) and states no address, telephone number, price, delivery or returns term. Add specifics only once confirmed.</Alert></div>
      <div className="space-y-4">
        {rows.map(({ c, docs }) => (
          <details key={c.def.path} className="panel">
            <summary className="cursor-pointer px-4 py-3 flex flex-wrap items-center gap-3"><span className="font-medium">{c.def.navLabel}</span><span className="mono text-xs text-steel">/{c.def.path}</span>{c.customised ? <Badge tone="good">Edited</Badge> : <Badge>Draft copy</Badge>}</summary>
            <div className="p-4 border-t border-line space-y-6">
              <ActionForm action={savePageAction} className="space-y-3 max-w-3xl">
                <input type="hidden" name="path" value={c.def.path} />
                <Field name="intro" label="Introduction (under the title)" defaultValue={c.intro} maxLength={400} />
                <Field name="body" type="textarea" rows={12} label="Page text (Markdown)" defaultValue={c.body} hint="Use ## for headings, - for lists and [text](https://…) for links. Plain HTML is not allowed." />
                <Field name="photo" type="select" label="Hero photograph" defaultValue={c.photo ?? ''} options={photos} hint="Shown under the page title. Upload your own under Content → Photos." />
                <div className="flex flex-wrap gap-3"><SubmitButton>Save page</SubmitButton><a href={`/${c.def.path}`} target="_blank" rel="noopener" className="btn btn-outline">View on website</a></div>
              </ActionForm>
              {c.customised && <ActionForm action={resetPageAction}><input type="hidden" name="path" value={c.def.path} /><SubmitButton className="btn btn-danger btn-sm" pending="Resetting…">Reset to placeholder text</SubmitButton></ActionForm>}
              {c.def.documents && (
                <div className="max-w-3xl border-t border-line pt-4">
                  <h3 className="!text-base mb-2">Downloads (PDF)</h3>
                  {docs.length === 0 ? <p className="text-sm text-steel mb-3">None published.</p> : (
                    <ul className="divide-y divide-line mb-4">{docs.map((d) => (
                      <li key={d.id} className="py-2 flex flex-wrap items-center justify-between gap-3 text-sm"><span><strong>{d.title}</strong> <span className="text-steel">· {fmtDate(d.createdAt)} · {SCAN_LABELS[d.scanStatus]}</span></span>
                        <ActionForm action={removeDocumentAction}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="path" value={c.def.path} /><SubmitButton className="btn btn-danger btn-sm" pending="Removing…">Remove</SubmitButton></ActionForm></li>
                    ))}</ul>
                  )}
                  <ActionForm action={addDocumentAction} resetOnSuccess className="space-y-3" encType="multipart/form-data">
                    <input type="hidden" name="path" value={c.def.path} />
                    <Field name="title" label="Document title" required placeholder="e.g. Product brochure 2026" />
                    <Field name="file" type="file" label="PDF file" accept=".pdf" required hint="Up to 10 MB. Anyone can download it once published." />
                    <SubmitButton pending="Uploading…">Publish document</SubmitButton>
                  </ActionForm>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
