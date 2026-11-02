import Link from 'next/link';
import { requireInternal } from '@/server/rbac';
import { getMyProfile } from '@/server/staff-portal';
import { getSetting } from '@/server/settings';
import { ROLE_LABELS } from '@/lib/permissions';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { saveMyProfileAction } from './actions';

export const metadata = { title: 'My profile' };

export default async function MyProfile() {
  const user = await requireInternal();
  const [p, depts] = await Promise.all([getMyProfile(user), getSetting('departments')]);
  return (
    <>
      <h1 className="!text-3xl mb-1">My profile</h1>
      <p className="text-steel mb-6">{user.name} · {user.email} · {ROLE_LABELS[user.role]}. Your name, email and role come from your account. <Link href="/admin/account/security">Set up two-factor sign-in</Link>.</p>
      <ActionForm action={saveMyProfileAction} className="grid gap-4 max-w-xl">
        <Field name="jobTitle" label="Job title" defaultValue={p?.jobTitle ?? ''} />
        <Field name="department" label="Department" type="select" defaultValue={p?.department ?? ''} options={[{ value: '', label: 'Not set' }, ...depts.map((d) => ({ value: d.key, label: d.label }))]} hint="Department updates are shown to the people in that department." />
        <Field name="location" label="Office or location" defaultValue={p?.location ?? ''} />
        <Field name="phone" label="Work phone" type="tel" defaultValue={p?.phone ?? ''} />
        <Field name="about" label="About you" type="textarea" rows={4} defaultValue={p?.about ?? ''} hint="Up to 600 characters. Visible to colleagues." />
        <Field name="showInDirectory" label="List me in the staff directory" type="checkbox" defaultValue={p?.showInDirectory ?? true} />
        <div><SubmitButton pending="Saving…">Save profile</SubmitButton></div>
      </ActionForm>
    </>
  );
}
