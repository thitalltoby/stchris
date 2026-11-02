import { requireInternal } from '@/server/rbac';
import { listStaffDocuments } from '@/server/staff-portal';
import { Icon } from '@/components/Icon';
import { Empty } from '@/components/ui';
import { fmtBytes } from '@/lib/format';

export const metadata = { title: 'Documents' };

export default async function StaffDocuments() {
  const user = await requireInternal();
  const docs = await listStaffDocuments(user);
  const groups = new Map<string, typeof docs>();
  for (const d of docs) groups.set(d.category, [...(groups.get(d.category) ?? []), d]);
  return (
    <>
      <h1 className="!text-3xl mb-1">Approved documents</h1>
      <p className="text-steel mb-6">Policies, forms and guides approved for staff.</p>
      {docs.length === 0 ? <Empty title="No documents yet">Documents approved by management appear here.</Empty> : (
        [...groups.entries()].map(([cat, list]) => (
          <section key={cat} className="mb-8 max-w-3xl" aria-labelledby={`c-${cat}`}>
            <h2 id={`c-${cat}`} className="!text-lg mb-2">{cat}</h2>
            <ul className="panel divide-y divide-line">
              {list.map((d) => (
                <li key={d.id}><a href={`/staff/documents/${d.id}/file`} className="flex items-start gap-3 p-4 !text-charcoal no-underline hover:bg-paper-2/60"><Icon name="file" className="mt-1 shrink-0 text-ember" /><span><span className="font-semibold block">{d.title}</span>{d.description && <span className="text-sm text-steel block">{d.description}</span>}<span className="text-xs text-steel">{d.document.originalName} · {fmtBytes(d.document.sizeBytes)}</span></span></a></li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
