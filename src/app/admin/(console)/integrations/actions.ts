'use server';

import { revalidatePath } from 'next/cache';
import { runAction, str, bool, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { saveIntegration, testIntegration } from '@/server/integrations';
import { adapterByKey } from '@/server/integrations/registry';

export async function saveIntegrationAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('integration.manage');
    const key = str(fd, 'key');
    const a = adapterByKey(key);
    const values: Record<string, string> = {};
    for (const f of a?.fields ?? []) values[f.key] = f.type === 'checkbox' ? (bool(fd, `f_${f.key}`) ? 'true' : '') : str(fd, `f_${f.key}`);
    const events = (a?.events ?? []).filter((e) => bool(fd, `e_${e}`));
    await saveIntegration(user, key, { enabled: bool(fd, 'enabled'), values, events });
    revalidatePath('/admin/integrations');
    return 'Saved.';
  });
}

export async function testIntegrationAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('integration.manage');
    const r = await testIntegration(user, str(fd, 'key'));
    revalidatePath('/admin/integrations');
    if (!r.ok) throw new Error(r.message);
    return r.message;
  });
}
