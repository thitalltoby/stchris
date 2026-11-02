import Link from 'next/link';
import { AuthCard } from '@/components/AuthCard';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { resendVerificationAction } from '../../auth-actions';

export const metadata = { title: 'Check your email', robots: { index: false } };

export default function CheckEmailPage() {
  return (
    <AuthCard title="Check your email" intro="We have sent a confirmation link to the address you registered with. Open it to activate your account." footer={<p><Link href="/login">Back to sign in</Link></p>}>
      <p className="text-sm text-steel mb-4">No email? Check your spam folder, or request a new link.</p>
      <ActionForm action={resendVerificationAction} className="space-y-4">
        <Field name="email" type="email" label="Email address" required autoComplete="email" />
        <SubmitButton className="btn btn-outline w-full">Send a new link</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
