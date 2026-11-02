import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { PageHeader, Badge } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { listMedia, mediaUsage } from '@/server/media';
import { SCAN_LABELS, isServable } from '@/server/scan';
import { fmtDate, fmtBytes } from '@/lib/format';
import { addPhotoAction, removePhotoAction } from './actions';

export const metadata = { title: 'Photos' };

export default async function PhotosAdmin() {
  await requireStaff('content.manage');
  const photos = await listMedia({ includeHeld: true });
  const usage = await Promise.all(photos.map((p) => mediaUsage(p.id)));
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/admin/content">← Content</Link></p>
      <PageHeader title="Photos" eyebrow="Media library"><p>Upload St. Chris’s own photographs, then choose them on categories, products, request types and company pages. Photos are public once they pass the security scan.</p></PageHeader>
      <section className="panel panel-pad max-w-2xl mb-8" aria-labelledby="add-h"><h2 id="add-h" className="!text-lg mb-3">Add a photo</h2>
        <ActionForm action={addPhotoAction} resetOnSuccess className="space-y-3" encType="multipart/form-data">
          <Field name="file" type="file" label="Photo (JPG or PNG)" accept=".jpg,.jpeg,.png" required hint="Up to 10 MB. Large photos are resized for visitors automatically." />
          <Field name="alt" label="Describe the photo" required maxLength={200} hint="One plain sentence for people who cannot see it, e.g. “Boxed tiles stacked on pallets in the St. Chris warehouse”. Do not describe it as a St. Chris project photo unless it is." />
          <SubmitButton pending="Uploading…">Upload photo</SubmitButton>
        </ActionForm></section>
      <h2 className="!text-lg mb-3">Library ({photos.length})</h2>
      {photos.length === 0 ? <p className="text-steel">No photos uploaded yet. The site uses the supplied photographs until you add your own.</p> : (
        <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {photos.map((p, i) => (
            <li key={p.id} className="panel">
              {isServable(p.scanStatus)
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/media/${p.id}`} alt={p.title ?? ''} className="w-full aspect-[4/3] object-cover" loading="lazy" />
                : <div className="aspect-[4/3] bg-paper grid place-items-center text-sm text-steel p-4 text-center">Held back until the security scan completes</div>}
              <div className="p-4 space-y-2 text-sm">
                <p className="font-medium">{p.title}</p>
                <p className="text-steel">{p.originalName} · {fmtBytes(p.sizeBytes)} · {fmtDate(p.createdAt)}</p>
                <p><Badge tone={isServable(p.scanStatus) ? 'good' : 'warn'}>{SCAN_LABELS[p.scanStatus]}</Badge></p>
                {usage[i]!.length > 0 ? <p className="text-steel">In use: {usage[i]!.join('; ')}</p> : (
                  <ActionForm action={removePhotoAction}><input type="hidden" name="id" value={p.id} /><SubmitButton className="btn btn-danger btn-sm" pending="Removing…">Remove</SubmitButton></ActionForm>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
