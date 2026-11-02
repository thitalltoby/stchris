import Link from 'next/link';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { Alert } from '@/components/ui';
import { resetAction } from '@/app/(site)/auth-actions';

export const metadata = { title: 'Choose a new password' };

export default async function AdminReset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Choose a new password" footer={<p><Link href="/admin/forgot-password">Request a new link</Link></p>}>
      {!token ? <Alert tone="error">This reset link is incomplete. Please request a new one.</Alert> : (
        <ActionForm action={resetAction} className="space-y-5">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="scope" value="staff" />
          <Field name="password" type="password" label="New password" required autoComplete="new-password" hint="At least 12 characters." />
          <Field name="confirm" type="password" label="Confirm new password" required autoComplete="new-password" />
          <SubmitButton className="btn btn-primary w-full">Update password</SubmitButton>
        </ActionForm>
      )}
    </AuthCard>
  );
}
