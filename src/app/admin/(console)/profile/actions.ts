'use server';

import { revalidatePath } from 'next/cache';
import { runAction, str, bool, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { saveExecutive, saveTimelineEntry, deleteTimelineEntry } from '@/server/site-content';
import { slugify } from '@/lib/format';

function refresh() { for (const p of ['/chris-iyoha', '/leadership', '/partnerships/geepee-tanks', '/admin/profile']) revalidatePath(p); }

export async function saveExecutiveAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('profile.manage');
    const sections = [0, 1, 2, 3, 4].map((i) => ({ id: str(fd, `sid${i}`) || slugify(str(fd, `stitle${i}`)).slice(0, 30), title: str(fd, `stitle${i}`), body: str(fd, `sbody${i}`) })).filter((s) => s.title || s.body);
    const principles = [0, 1, 2, 3].map((i) => ({ title: str(fd, `ptitle${i}`), body: str(fd, `pbody${i}`) })).filter((p) => p.title || p.body);
    await saveExecutive(user, { headline: str(fd, 'headline'), strapline: str(fd, 'strapline'), portraitKey: str(fd, 'portraitKey'), closing: str(fd, 'closing'), sections, principles, linkedin: str(fd, 'linkedin'), x: str(fd, 'x'), instagram: str(fd, 'instagram'), facebook: str(fd, 'facebook') });
    refresh();
    return 'Saved. The profile page is updated.';
  });
}

export async function saveTimelineAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('profile.manage');
    await saveTimelineEntry(user, str(fd, 'id') || null, { scope: str(fd, 'scope'), kind: str(fd, 'kind'), period: str(fd, 'period'), title: str(fd, 'title'), body: str(fd, 'body'), attribution: str(fd, 'attribution'), imageKey: str(fd, 'imageKey'), sortOrder: Number(str(fd, 'sortOrder') || 0), visible: bool(fd, 'visible') });
    refresh();
    return 'Saved.';
  });
}

export async function deleteTimelineAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('profile.manage');
    await deleteTimelineEntry(user, str(fd, 'id'));
    refresh();
    return 'Removed.';
  });
}
