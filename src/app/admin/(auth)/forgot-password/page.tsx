import Link from 'next/link';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { forgotAction } from '@/app/(site)/auth-actions';

export const metadata = { title: 'Reset staff password' };

export default function AdminForgot() {
  return (
    <AuthCard title="Forgot your password?" intro="Enter your work email and we will send you a reset link." footer={<p><Link href="/admin/login">Back to sign in</Link></p>}>
      <ActionForm action={forgotAction} className="space-y-5">
        <Field name="email" type="email" label="Work email" required autoComplete="username" />
        <SubmitButton className="btn btn-primary w-full">Send reset link</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
