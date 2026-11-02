import Link from 'next/link';
import { AuthCard } from '@/components/AuthCard';
import { Alert } from '@/components/ui';
import { verifyEmailToken } from '@/server/auth';

export const metadata = { title: 'Confirm email', robots: { index: false } };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await verifyEmailToken(token) : false;
  return (
    <AuthCard title={ok ? 'Email confirmed' : 'Link not valid'} footer={<p><Link href="/login">Go to sign in</Link></p>}>
      {ok ? <Alert tone="ok">Thank you. Your email address is confirmed and any requests you sent with it are now in your portal.</Alert>
        : <Alert tone="error">This confirmation link is invalid, already used, or has expired. Sign in to receive a new one.</Alert>}
    </AuthCard>
  );
}
