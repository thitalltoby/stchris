'use server';

import { revalidatePath } from 'next/cache';
import { runAction, str, bool, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { saveMediaItem, deleteMediaItem } from '@/server/site-content';

function refresh() { for (const p of ['/media-centre', '/admin/media-centre']) revalidatePath(p); }

export async function saveMediaItemAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('media.manage');
    await saveMediaItem(user, str(fd, 'id') || null, { kind: str(fd, 'kind'), title: str(fd, 'title'), summary: str(fd, 'summary'), body: str(fd, 'body'), source: str(fd, 'source'), url: str(fd, 'url'), eventDate: str(fd, 'eventDate'), location: str(fd, 'location'), imageKey: str(fd, 'imageKey'), videoUrl: str(fd, 'videoUrl'), publish: bool(fd, 'publish') });
    refresh();
    return 'Saved.';
  });
}
export async function deleteMediaItemAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('media.manage');
    await deleteMediaItem(user, str(fd, 'id'));
    refresh();
    return 'Deleted.';
  });
}
