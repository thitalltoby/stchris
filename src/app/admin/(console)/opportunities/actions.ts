'use server';

import { revalidatePath } from 'next/cache';
import { runAction, str, bool, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { saveOpportunity, deleteOpportunity } from '@/server/site-content';

function refresh() { for (const p of ['/opportunities', '/admin/opportunities', '/']) revalidatePath(p); revalidatePath('/opportunities/[slug]', 'page'); }

export async function saveOpportunityAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('opportunity.manage');
    await saveOpportunity(user, str(fd, 'id') || null, { kind: str(fd, 'kind'), title: str(fd, 'title'), summary: str(fd, 'summary'), body: str(fd, 'body'), location: str(fd, 'location'), closesOn: str(fd, 'closesOn'), publish: bool(fd, 'publish') });
    refresh();
    return 'Saved.';
  });
}
export async function deleteOpportunityAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('opportunity.manage');
    await deleteOpportunity(user, str(fd, 'id'));
    refresh();
    return 'Deleted.';
  });
}
