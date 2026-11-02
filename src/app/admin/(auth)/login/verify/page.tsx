import { redirect } from 'next/navigation';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { verifyMfaAction, cancelMfaAction } from '@/app/(site)/auth-actions';
import { currentChallenge } from '@/server/mfa';

export const metadata = { title: 'Two-factor check' };

export default async function VerifyMfa() {
  const c = await currentChallenge();
  if (!c) redirect('/admin/login');
  return (
    <AuthCard title="Enter your code" intro={`Open your authenticator app and enter the 6-digit code for St. Chris Materials Desk (${c.user.email}).`}>
      <ActionForm action={verifyMfaAction} className="space-y-5">
        <Field name="code" label="6-digit code or recovery code" required autoComplete="one-time-code" inputMode="text" hint="Lost your phone? Use one of your recovery codes, or ask a Super Admin to reset your two-factor sign-in." />
        <SubmitButton className="btn btn-primary w-full" pending="Checking…">Verify and sign in</SubmitButton>
      </ActionForm>
      <form action={cancelMfaAction} className="mt-5"><button type="submit" className="text-sm underline">Use a different account</button></form>
    </AuthCard>
  );
}
