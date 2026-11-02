'use server';

import { revalidatePath } from 'next/cache';
import { runAction, str, bool, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { saveFaq, deleteFaq } from '@/server/content';

export async function saveFaqAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('content.manage');
    await saveFaq(user, str(fd, 'id') || null, { question: str(fd, 'question'), answer: str(fd, 'answer'), sortOrder: Number(str(fd, 'sortOrder') || 0), visible: bool(fd, 'visible') });
    revalidatePath('/contact'); revalidatePath('/admin/content');
    return 'Saved.';
  });
}

export async function deleteFaqAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('content.manage');
    await deleteFaq(user, str(fd, 'id'));
    revalidatePath('/contact'); revalidatePath('/admin/content');
    return 'Deleted.';
  });
}
