import Link from 'next/link';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { forgotAction } from '../auth-actions';

export const metadata = { title: 'Forgot password', robots: { index: false } };

export default function ForgotPage() {
  return (
    <AuthCard title="Forgot your password?" intro="Enter your email address and we will send you a link to choose a new one." footer={<p><Link href="/login">Back to sign in</Link></p>}>
      <ActionForm action={forgotAction} className="space-y-5">
        <Field name="email" type="email" label="Email address" required autoComplete="email" />
        <SubmitButton className="btn btn-primary w-full" pending="Sending…">Send reset link</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
