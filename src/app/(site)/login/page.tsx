import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { Alert } from '@/components/ui';
import { loginAction } from '../auth-actions';
import { getSessionUser } from '@/server/session';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; registered?: string; reset?: string; verified?: string }> }) {
  const sp = await searchParams;
  const u = await getSessionUser();
  if (u) redirect(u.role === 'CUSTOMER' ? '/portal' : u.role === 'STAFF_MEMBER' ? '/staff' : '/admin');
  return (
    <AuthCard title="Sign in" intro="Customer portal for your requests and quotations." footer={<p>New here? <Link href="/register">Create an account</Link>. St. Chris staff: <Link href="/admin/login">staff sign-in</Link>.</p>}>
      {sp.registered && <div className="mb-4"><Alert tone="ok">Account created. You can sign in now.</Alert></div>}
      {sp.reset && <div className="mb-4"><Alert tone="ok">Password updated. Sign in with your new password.</Alert></div>}
      {sp.verified && <div className="mb-4"><Alert tone="ok">Email confirmed. Sign in to continue.</Alert></div>}
      <ActionForm action={loginAction} className="space-y-5">
        <input type="hidden" name="scope" value="customer" />
        <input type="hidden" name="next" value={sp.next ?? ''} />
        <Field name="email" type="email" label="Email address" required autoComplete="email" />
        <Field name="password" type="password" label="Password" required autoComplete="current-password" />
        <SubmitButton className="btn btn-primary w-full" pending="Signing in…">Sign in</SubmitButton>
      </ActionForm>
      <p className="mt-5 text-sm"><Link href="/forgot-password">Forgot your password?</Link></p>
    </AuthCard>
  );
}
