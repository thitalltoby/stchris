import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { Alert } from '@/components/ui';
import { loginAction } from '@/app/(site)/auth-actions';
import { getSessionUser } from '@/server/session';

export const metadata = { title: 'Staff sign-in' };

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  const u = await getSessionUser();
  if (u) redirect(u.role === 'CUSTOMER' ? '/portal' : u.role === 'STAFF_MEMBER' ? '/staff' : '/admin');
  return (
    <AuthCard title="Staff sign-in" intro="St. Chris Materials Desk operations console." footer={<p>Customer? <Link href="/login">Use the customer sign-in</Link>.</p>}>
      {sp.reset && <div className="mb-4"><Alert tone="ok">Password updated. Sign in with your new password.</Alert></div>}
      <ActionForm action={loginAction} className="space-y-5">
        <input type="hidden" name="scope" value="staff" />
        <input type="hidden" name="next" value={sp.next ?? ''} />
        <Field name="email" type="email" label="Work email" required autoComplete="username" />
        <Field name="password" type="password" label="Password" required autoComplete="current-password" />
        <SubmitButton className="btn btn-primary w-full" pending="Signing in…">Sign in</SubmitButton>
      </ActionForm>
      <p className="mt-5 text-sm"><Link href="/admin/forgot-password">Forgot your password?</Link></p>
    </AuthCard>
  );
}
