'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, str, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { saveCompany, saveContact, addCompanyNote } from '@/server/customers';

export async function saveCompanyAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    const id = str(fd, 'id') || null;
    const c = await saveCompany(user, id, { name: str(fd, 'name'), industry: str(fd, 'industry'), website: str(fd, 'website'), address: str(fd, 'address'), notes: str(fd, 'notes'), ownerId: str(fd, 'ownerId') });
    if (!id) redirect(`/admin/customers/${c.id}`);
    revalidatePath(`/admin/customers/${c.id}`);
    return 'Saved.';
  });
}

export async function saveContactAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    const companyId = str(fd, 'companyId');
    await saveContact(user, companyId, str(fd, 'contactId') || null, { name: str(fd, 'name'), email: str(fd, 'email'), phone: str(fd, 'phone'), jobTitle: str(fd, 'jobTitle') });
    revalidatePath(`/admin/customers/${companyId}`);
    return 'Contact saved.';
  });
}

export async function addNoteAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    const companyId = str(fd, 'companyId');
    const t = str(fd, 'type');
    await addCompanyNote(user, companyId, str(fd, 'body'), t === 'CALL' || t === 'MEETING' ? t : 'NOTE');
    revalidatePath(`/admin/customers/${companyId}`);
    return 'Saved.';
  });
}
