'use server';

import { revalidatePath } from 'next/cache';
import { runAction, str, bool, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { saveDivision } from '@/server/site-content';

export async function saveDivisionAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('division.manage');
    await saveDivision(user, str(fd, 'id') || null, {
      name: str(fd, 'name'), slug: str(fd, 'slug'), tagline: str(fd, 'tagline'), summary: str(fd, 'summary'), description: str(fd, 'description'),
      highlights: str(fd, 'highlights'), offerings: str(fd, 'offerings'), categorySlugs: fd.getAll('categorySlugs').map(String).join('\n'),
      serviceSlug: str(fd, 'serviceSlug'), imageKey: str(fd, 'imageKey'), icon: str(fd, 'icon') || 'container',
      visible: bool(fd, 'visible'), sortOrder: Number(str(fd, 'sortOrder') || 0), needsReview: bool(fd, 'needsReview'),
    });
    for (const p of ['/', '/divisions', '/admin/divisions']) revalidatePath(p);
    revalidatePath('/divisions/[slug]', 'page');
    return 'Saved.';
  });
}
