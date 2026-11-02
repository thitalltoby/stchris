'use server';

import { revalidatePath } from 'next/cache';
import { runAction, str, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { confirmEnrollment, disableOwnMfa, regenerateRecoveryCodes, beginEnrollment } from '@/server/mfa';

const codesMessage = (codes: string[]) =>
  `Save these recovery codes somewhere safe. Each works once if you lose your phone. They are shown only now.\n\n${codes.join('\n')}`;

export async function startEnrollmentAction(_: FormState): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff(undefined, { allowUnenrolled: true });
    await beginEnrollment(u.id);
    revalidatePath('/admin/account/security');
  });
}

export async function confirmEnrollmentAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff(undefined, { allowUnenrolled: true });
    const codes = await confirmEnrollment(u.id, str(fd, 'code'));
    // No revalidatePath here: refreshing the page would replace this form with the "On" view and the codes, shown only once, would disappear before they are saved.
    return `Two-factor sign-in is on. ${codesMessage(codes)}\n\nWhen you have saved them, reload this page to manage two-factor sign-in.`;
  });
}

export async function regenerateCodesAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff(undefined, { allowUnenrolled: true });
    return `New recovery codes created. The old ones no longer work. ${codesMessage(await regenerateRecoveryCodes(u.id, str(fd, 'code')))}`;
  });
}

export async function disableMfaAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff(undefined, { allowUnenrolled: true });
    await disableOwnMfa(u.id, str(fd, 'password'), str(fd, 'code'));
    revalidatePath('/admin/account/security');
    return 'Two-factor sign-in is off.';
  });
}
