import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { can } from '@/lib/permissions';
import { photoOptions } from '@/server/media';
import { listMediaItemsAdmin, MEDIA_KINDS } from '@/server/site-content';
import { PageHeader, Badge, Empty } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { PhotoPicker } from '@/components/PhotoPicker';
import { saveMediaItemAction, deleteMediaItemAction } from './actions';
import { fmtDate } from '@/lib/format';

export const metadata = { title: 'Media centre' };
type Item = Awaited<ReturnType<typeof listMediaItemsAdmin>>[number];
const kinds = Object.entries(MEDIA_KINDS).map(([value, label]) => ({ value, label }));

export default async function MediaCentreAdmin() {
  const user = await requireStaff('media.manage');
  const [items, photos] = await Promise.all([listMediaItemsAdmin(), photoOptions()]);
  return (
    <>
      <PageHeader title="Media centre" eyebrow="Press and gallery" actions={can(user.role, 'content.manage') ? <Link href="/admin/content/photos" className="btn btn-outline">Photo library</Link> : undefined}>
        <p>Press releases, interviews, speaking engagements, announcements, commentary, mentions and the photo and video galleries.</p>
      </PageHeader>
      {items.length === 0 ? <Empty title="Nothing here yet">The public media centre shows only what you add. Add the first item below.</Empty> : (
        <ul className="grid gap-3 mb-8">
          {items.map((i) => (
            <li key={i.id} className="panel"><details>
              <summary className="p-4 cursor-pointer flex flex-wrap gap-2 items-center min-h-[2.75rem]"><Badge tone={i.status === 'PUBLISHED' ? 'good' : 'neutral'}>{i.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Badge><Badge>{MEDIA_KINDS[i.kind] ?? i.kind}</Badge><span className="font-semibold">{i.title}</span>{i.eventDate && <span className="text-sm text-steel">{fmtDate(i.eventDate)}</span>}</summary>
              <div className="p-4 pt-0"><ItemForm item={i} photos={photos} />
                <ActionForm action={deleteMediaItemAction} className="mt-3"><input type="hidden" name="id" value={i.id} /><SubmitButton className="btn btn-danger btn-sm" pending="Deleting…">Delete</SubmitButton></ActionForm></div>
            </details></li>
          ))}
        </ul>
      )}
      <details className="panel panel-pad"><summary className="cursor-pointer font-display font-bold min-h-[2.75rem] flex items-center">Add an item</summary><div className="mt-4"><ItemForm photos={photos} /></div></details>
    </>
  );
}

function ItemForm({ item, photos }: { item?: Item; photos: { value: string; label: string }[] }) {
  return (
    <ActionForm action={saveMediaItemAction} resetOnSuccess={!item} className="grid gap-4 max-w-2xl">
      {item && <input type="hidden" name="id" value={item.id} />}
      <Field name="kind" label="Type" type="select" options={kinds} defaultValue={item?.kind ?? 'PRESS_RELEASE'} />
      <Field name="title" label="Title" required defaultValue={item?.title ?? ''} />
      <Field name="summary" label="Short summary" type="textarea" rows={2} defaultValue={item?.summary ?? ''} />
      <Field name="body" label="Full text (optional)" type="textarea" rows={6} defaultValue={item?.body ?? ''} />
      <div className="grid gap-4 sm:grid-cols-2"><Field name="source" label="Publication, outlet or organiser" defaultValue={item?.source ?? ''} /><Field name="eventDate" label="Date" type="date" defaultValue={item?.eventDate ? item.eventDate.toISOString().slice(0, 10) : ''} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field name="location" label="Location" defaultValue={item?.location ?? ''} /><Field name="url" label="Link to the original" placeholder="https://" defaultValue={item?.url ?? ''} /></div>
      <Field name="videoUrl" label="Video (YouTube or Vimeo link)" placeholder="https://" defaultValue={item?.videoUrl ?? ''} hint="Needed for the Video type." />
      <PhotoPicker name="imageKey" label="Photo" options={photos} defaultValue={item?.imageKey ?? ''} hint="Needed for the Photo type." />
      <Field name="publish" label="Publish on the site" type="checkbox" defaultValue={item?.status === 'PUBLISHED'} />
      <div><SubmitButton pending="Saving…">{item ? 'Save changes' : 'Add item'}</SubmitButton></div>
    </ActionForm>
  );
}
