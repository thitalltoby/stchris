'use server';

import { revalidatePath } from 'next/cache';
import { runAction, str, files, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { saveSectionContent, resetSectionContent, addSectionDocument, removeSectionDocument } from '@/server/section-pages';
import { invalid } from '@/server/errors';

const refresh = (path: string) => { revalidatePath(`/${path}`); revalidatePath('/admin/content/pages'); };

export async function savePageAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('content.manage');
    const path = str(fd, 'path');
    await saveSectionContent(u, path, { intro: str(fd, 'intro'), body: str(fd, 'body'), photo: fd.has('photo') ? str(fd, 'photo') : undefined });
    refresh(path);
    return 'Saved. The page is updated on the website.';
  });
}

export async function resetPageAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('content.manage');
    const path = str(fd, 'path');
    await resetSectionContent(u, path);
    refresh(path);
    return 'Reset to the draft copy.';
  });
}

export async function addDocumentAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('content.manage');
    const path = str(fd, 'path');
    const f = files(fd, 'file')[0];
    if (!f) throw invalid('Choose a PDF to upload.', { file: 'Required.' });
    await addSectionDocument(u, path, f, str(fd, 'title'));
    refresh(path);
    return 'Published. It now appears on the page.';
  });
}

export async function removeDocumentAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('content.manage');
    await removeSectionDocument(u, str(fd, 'id'));
    refresh(str(fd, 'path'));
    return 'Removed from the website.';
  });
}
