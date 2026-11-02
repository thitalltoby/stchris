'use server';

import { revalidatePath } from 'next/cache';
import { runAction, str, bool, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { saveSeo, saveSeoSettings } from '@/server/site-content';

export async function saveSeoAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('seo.manage');
    const path = '/' + str(fd, 'path').trim().replace(/^\/+/, '');
    await saveSeo(user, path === '/' ? '/' : path.replace(/\/+$/, ''), { title: str(fd, 'title'), description: str(fd, 'description'), ogImageKey: str(fd, 'ogImageKey'), noindex: bool(fd, 'noindex') });
    revalidatePath('/', 'layout');
    return 'Saved. Search engines and share previews pick it up as they next visit the page.';
  });
}
export async function saveSeoSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('seo.manage');
    await saveSeoSettings(user, { searchConsoleToken: str(fd, 'searchConsoleToken'), defaultShareImage: str(fd, 'defaultShareImage') });
    revalidatePath('/', 'layout');
    return 'Saved.';
  });
}
