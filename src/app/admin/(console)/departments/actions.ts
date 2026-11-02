'use server';

import { revalidatePath } from 'next/cache';
import { runAction, str, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { saveDepartments } from '@/server/site-content';
import { getSetting } from '@/server/settings';

export async function saveDepartmentsAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('settings.manage');
    const current = await getSetting('departments');
    const rows = current.map((d) => ({ key: d.key, label: str(fd, `label_${d.key}`), email: str(fd, `email_${d.key}`), description: str(fd, `desc_${d.key}`) }));
    const nk = str(fd, 'new_key').trim();
    if (nk || str(fd, 'new_label').trim()) rows.push({ key: nk, label: str(fd, 'new_label'), email: str(fd, 'new_email'), description: str(fd, 'new_desc') });
    await saveDepartments(user, rows);
    revalidatePath('/admin/departments');
    return 'Saved. New enquiries go to these addresses from now on.';
  });
}
