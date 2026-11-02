import { requireStaff } from '@/server/rbac';
import { PageHeader } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { ROLE_LABELS } from '@/lib/permissions';
import Link from 'next/link';
import { changePasswordStaffAction } from './actions';

export const metadata = { title: 'My account' };

export default async function AccountPage() {
  const user = await requireStaff();
  return (
    <>
      <PageHeader title="My account" eyebrow={ROLE_LABELS[user.role]}><p>{user.name} · {user.email}</p></PageHeader>
      <section className="panel panel-pad max-w-lg mb-6"><h2 className="!text-lg mb-1">Two-factor sign-in</h2><p className="text-sm text-steel mb-3">Add a code from your phone to every sign-in.</p><Link href="/admin/account/security" className="btn btn-outline btn-sm">Manage two-factor sign-in</Link></section>
      <section className="panel panel-pad max-w-lg"><h2 className="!text-lg mb-4">Change password</h2>
        <ActionForm action={changePasswordStaffAction} resetOnSuccess className="space-y-4"><Field name="current" type="password" label="Current password" required autoComplete="current-password" /><Field name="next" type="password" label="New password" required autoComplete="new-password" hint="At least 12 characters." /><Field name="confirm" type="password" label="Confirm new password" required autoComplete="new-password" /><SubmitButton>Change password</SubmitButton></ActionForm></section>
    </>
  );
}
