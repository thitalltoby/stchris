'use server';

import { revalidatePath } from 'next/cache';
import { runAction, str, files, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { saveMedia, deleteMedia } from '@/server/media';
import { invalid } from '@/server/errors';

export async function addPhotoAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('content.manage');
    const list = files(fd, 'file');
    if (!list.length) throw invalid('Choose a photo to upload.', { file: 'Required.' });
    await saveMedia(u, list[0]!, str(fd, 'alt'));
    revalidatePath('/admin/content/photos');
    return 'Uploaded. It is available to choose on services, insights, leadership and pages.';
  });
}

export async function removePhotoAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('content.manage');
    await deleteMedia(u, str(fd, 'id'));
    revalidatePath('/admin/content/photos');
    return 'Removed.';
  });
}
