'use server';

import { revalidatePath } from 'next/cache';
import { runAction, str, bool, files, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { saveStaffPost, deleteStaffPost, addStaffDocument, removeStaffDocument } from '@/server/staff-portal';
import { invalid } from '@/server/errors';

function refresh() { for (const p of ['/staff', '/staff/documents', '/admin/staff-portal']) revalidatePath(p); }

export async function saveStaffPostAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('staffportal.manage');
    await saveStaffPost(user, str(fd, 'id') || null, { kind: str(fd, 'kind'), title: str(fd, 'title'), body: str(fd, 'body'), department: str(fd, 'department'), pinned: bool(fd, 'pinned'), publish: bool(fd, 'publish') });
    refresh();
    return 'Saved.';
  });
}
export async function deleteStaffPostAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('staffportal.manage');
    await deleteStaffPost(user, str(fd, 'id'));
    refresh();
    return 'Deleted.';
  });
}
export async function addStaffDocumentAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('staffportal.manage');
    const f = files(fd, 'file')[0];
    if (!f) throw invalid('Choose a file.', { file: 'Required.' });
    await addStaffDocument(user, f, { title: str(fd, 'title'), description: str(fd, 'description'), category: str(fd, 'category'), department: str(fd, 'department') });
    refresh();
    return 'Added. Staff can open it once it passes the security scan.';
  });
}
export async function removeStaffDocumentAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('staffportal.manage');
    await removeStaffDocument(user, str(fd, 'id'));
    refresh();
    return 'Removed.';
  });
}
