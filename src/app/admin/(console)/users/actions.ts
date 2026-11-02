'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { runAction, str, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { createStaffUser, updateUser } from '@/server/users';
import { kick } from '@/server/handlers';
import { adminResetMfa } from '@/server/mfa';
import type { Role } from '@/generated/prisma/enums';

export async function createUserAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await actionStaff('user.manage');
    await createStaffUser(actor, { name: str(fd, 'name'), email: str(fd, 'email'), role: str(fd, 'role'), approvalLimit: str(fd, 'approvalLimit') });
    revalidatePath('/admin/users');
    after(() => kick());
    return 'User created. They have been emailed a link to set their password.';
  });
}

export async function updateUserAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await actionStaff('user.manage');
    await updateUser(actor, str(fd, 'userId'), { role: str(fd, 'role') as Role, approvalLimit: str(fd, 'approvalLimit') || null, isActive: str(fd, 'isActive') === 'true' });
    revalidatePath('/admin/users');
    return 'Saved.';
  });
}

export async function resetMfaAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const actor = await actionStaff('user.manage');
    await adminResetMfa(actor, str(fd, 'userId'));
    revalidatePath('/admin/users');
    return 'Two-factor sign-in cleared. The person was signed out and can set it up again.';
  });
}
