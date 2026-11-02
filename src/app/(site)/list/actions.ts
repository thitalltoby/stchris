'use server';

import { revalidatePath } from 'next/cache';
import { addToList, removeListItem, updateListItem, clearList, type ListView } from '@/server/project-list';
import { runAction, str, type FormState } from '@/server/action-utils';
import { AppError, safeMessage } from '@/server/errors';
import { unstable_rethrow } from 'next/navigation';

export type ListResult = { ok: true; view: ListView; message?: string } | { ok: false; error: string };

/** Plain functions called from client components. They return the new list so the page can update without a reload. */
async function wrap(fn: () => Promise<ListView>, message?: string): Promise<ListResult> {
  try {
    const view = await fn();
    revalidatePath('/', 'layout'); // the header count
    return { ok: true, view, message };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: e instanceof AppError ? e.message : safeMessage(e) };
  }
}

export async function addItemAction(input: { productId?: string; variantId?: string; label?: string; unit?: string; quantity?: number; note?: string }): Promise<ListResult> {
  return wrap(() => addToList(input), 'Added to your project list.');
}
export async function updateItemAction(id: string, input: { quantity?: number; note?: string; unit?: string }): Promise<ListResult> {
  return wrap(() => updateListItem(id, input));
}
export async function removeItemAction(id: string): Promise<ListResult> {
  return wrap(() => removeListItem(id), 'Removed from your list.');
}

/** Form-action versions so the buttons also work without JavaScript */
export async function addItemFormAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await addToList({ productId: str(fd, 'productId'), variantId: str(fd, 'variantId'), label: str(fd, 'label'), unit: str(fd, 'unit'), quantity: str(fd, 'quantity') || 1, note: str(fd, 'note') });
    revalidatePath('/', 'layout');
    return 'Added to your project list.';
  });
}

export async function clearListAction(): Promise<FormState> {
  return runAction(async () => {
    await clearList();
    revalidatePath('/', 'layout');
    return 'Your list is empty.';
  });
}
