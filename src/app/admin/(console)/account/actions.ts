'use server';

import { runAction, str, type FormState } from '@/server/action-utils';
import { actionStaff, actionCustomer } from '@/server/rbac';
import { changePassword } from '@/server/auth';
import { invalid } from '@/server/errors';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, revokeUserSessions } from '@/server/session';
import { sha256 } from '@/server/crypto';

async function change(user: { id: string }, fd: FormData) {
  if (str(fd, 'next') !== str(fd, 'confirm')) throw invalid('The new passwords do not match.', { confirm: 'Does not match.' });
  await changePassword(user.id, str(fd, 'current'), str(fd, 'next'));
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await revokeUserSessions(user.id, token ? sha256(token) : undefined); // sign out other devices, keep this one
  return 'Password changed. Other devices were signed out.';
}

export async function changePasswordStaffAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => change(await actionStaff(), fd));
}
export async function changePasswordCustomerAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => change(await actionCustomer(), fd));
}
