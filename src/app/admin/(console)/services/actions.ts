'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, str, bool, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { saveService, saveServiceField, deleteServiceField } from '@/server/content';

const num = (fd: FormData, k: string) => Number(str(fd, k) || 0);

export async function saveServiceAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('service.manage');
    const id = str(fd, 'id') || null;
    const s = await saveService(user, id, { name: str(fd, 'name'), slug: str(fd, 'slug'), pillar: str(fd, 'pillar'), department: str(fd, 'department') || undefined, summary: str(fd, 'summary'), description: str(fd, 'description'), instructions: str(fd, 'instructions'), highlights: str(fd, 'highlights'), imageKey: fd.has('imageKey') ? str(fd, 'imageKey') : undefined, icon: str(fd, 'icon') || 'list', acceptsItems: bool(fd, 'acceptsItems'), visible: bool(fd, 'visible'), sortOrder: num(fd, 'sortOrder') });
    revalidatePath('/services'); revalidatePath('/'); revalidatePath('/request');
    if (!id) redirect(`/admin/services/${s.id}`);
    revalidatePath(`/admin/services/${s.id}`);
    return 'Saved. The public site shows this change immediately.';
  });
}

export async function saveFieldAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('service.manage');
    const serviceId = str(fd, 'serviceId');
    await saveServiceField(user, serviceId, str(fd, 'fieldId') || null, { key: str(fd, 'key'), label: str(fd, 'label'), type: str(fd, 'type'), required: bool(fd, 'required'), options: str(fd, 'options'), unit: str(fd, 'unit'), helpText: str(fd, 'helpText'), placeholder: str(fd, 'placeholder'), section: str(fd, 'section'), sortOrder: num(fd, 'sortOrder'), visible: bool(fd, 'visible') });
    revalidatePath(`/admin/services/${serviceId}`); revalidatePath('/request');
    return 'Field saved. Existing requests keep the labels they were submitted with.';
  });
}

export async function deleteFieldAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('service.manage');
    await deleteServiceField(user, str(fd, 'fieldId'));
    revalidatePath(`/admin/services/${str(fd, 'serviceId')}`); revalidatePath('/request');
    return 'Field removed.';
  });
}
