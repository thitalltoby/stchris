'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { runAction, str, bool, files, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { changeStatus, assignRequest, addCommunication, requestMoreInfo, createTask, completeTask, attachDocuments } from '@/server/requests';
import { createQuotation } from '@/server/quotations';
import { kick } from '@/server/handlers';
import { invalid } from '@/server/errors';
import type { RequestStatus } from '@/generated/prisma/enums';
import type { CommType } from '@/generated/prisma/enums';
import { STATUS_LABELS } from '@/lib/workflow';

const refresh = (id: string) => { revalidatePath(`/admin/requests/${id}`); after(() => kick()); };

export async function changeStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    const id = str(fd, 'id');
    const to = str(fd, 'to') as RequestStatus;
    if (!(to in STATUS_LABELS)) throw invalid('Choose a status.', { to: 'Required.' });
    await changeStatus(user, id, to, str(fd, 'note'));
    refresh(id);
    return `Status changed to “${STATUS_LABELS[to]}”.`;
  });
}

export async function assignAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    const id = str(fd, 'id');
    await assignRequest(user, id, str(fd, 'assigneeId') || null);
    refresh(id);
    return 'Assignment saved.';
  });
}

export async function addCommAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    const id = str(fd, 'id');
    const type = str(fd, 'type') as CommType;
    if (!['NOTE', 'MESSAGE', 'EMAIL', 'CALL', 'MEETING', 'WHATSAPP', 'SMS'].includes(type)) throw invalid('Choose a type.');
    await addCommunication(user, id, { type, body: str(fd, 'body'), subject: str(fd, 'subject'), customerVisible: type === 'MESSAGE' || bool(fd, 'customerVisible') });
    refresh(id);
    return type === 'MESSAGE' ? 'Message sent to the customer.' : 'Saved.';
  });
}

export async function requestInfoAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    const id = str(fd, 'id');
    await requestMoreInfo(user, id, str(fd, 'question'));
    refresh(id);
    return 'The customer has been asked for more information.';
  });
}

export async function createTaskAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    const due = str(fd, 'dueAt');
    const requestId = str(fd, 'id') || null;
    await createTask(user, { title: str(fd, 'title'), dueAt: new Date(`${due}T09:00:00.000Z`), requestId, companyId: str(fd, 'companyId') || null, assigneeId: str(fd, 'assigneeId') || user.id, notes: str(fd, 'notes') });
    if (requestId) revalidatePath(`/admin/requests/${requestId}`);
    revalidatePath('/admin/tasks');
    return 'Follow-up added.';
  });
}

export async function completeTaskAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    await completeTask(user, str(fd, 'taskId'), str(fd, 'done') !== 'false');
    revalidatePath('/admin/tasks');
    if (str(fd, 'id')) revalidatePath(`/admin/requests/${str(fd, 'id')}`);
  });
}

export async function uploadDocAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    const id = str(fd, 'id');
    await attachDocuments(user, id, files(fd, 'files'), str(fd, 'visibility') === 'CUSTOMER' ? 'CUSTOMER' : 'INTERNAL');
    revalidatePath(`/admin/requests/${id}`);
    return 'Uploaded.';
  });
}

export async function createQuotationAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    const { quotationId } = await createQuotation(user, str(fd, 'id'));
    redirect(`/admin/quotations/${quotationId}`);
  });
}
