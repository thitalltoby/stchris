'use server';

import { revalidatePath } from 'next/cache';
import { runAction, str, bool, type FormState } from '@/server/action-utils';
import { actionInternal } from '@/server/rbac';
import { saveMyProfile } from '@/server/staff-portal';

export async function saveMyProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionInternal();
    await saveMyProfile(user, { jobTitle: str(fd, 'jobTitle'), department: str(fd, 'department'), location: str(fd, 'location'), phone: str(fd, 'phone'), about: str(fd, 'about'), showInDirectory: bool(fd, 'showInDirectory') });
    revalidatePath('/staff/directory');
    return 'Saved.';
  });
}
