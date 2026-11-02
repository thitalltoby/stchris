import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { Alert } from '@/components/ui';
import { registerAction } from '../auth-actions';
import { db } from '@/server/db';
import { sha256 } from '@/server/crypto';

export const metadata: Metadata = { title: 'Create an account', robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ email?: string; invite?: string }> }) {
  const sp = await searchParams;
  const invite = sp.invite ? await db.companyInvite.findUnique({ where: { tokenHash: sha256(sp.invite) }, include: { company: true } }) : null;
  const validInvite = invite && !invite.acceptedAt && invite.expiresAt > new Date() ? invite : null;
  return (
    <AuthCard title="Create an account" intro="Follow your requests, reply to questions and respond to quotations online." footer={<p>Already registered? <Link href="/login">Sign in</Link>.</p>}>
      {sp.invite && !validInvite && <div className="mb-4"><Alert tone="error">This invitation is invalid or has expired. Ask your colleague to send a new one.</Alert></div>}
      {validInvite && <div className="mb-4"><Alert tone="info">You have been invited to join <strong>{validInvite.company.name}</strong>.</Alert></div>}
      <ActionForm action={registerAction} className="space-y-5">
        {validInvite && <input type="hidden" name="invite" value={sp.invite} />}
        <Field name="name" label="Full name" required autoComplete="name" />
        <Field name="email" type="email" label="Email address" required autoComplete="email" defaultValue={validInvite?.email ?? sp.email ?? ''} readOnly={!!validInvite} hint="If you have already sent requests with this address, they will appear in your portal once you confirm it." />
        <Field name="phone" type="tel" label="Phone number" autoComplete="tel" />
        {!validInvite && <Field name="companyName" label="Company" required autoComplete="organization" />}
        <Field name="password" type="password" label="Password" required autoComplete="new-password" hint="At least 12 characters." />
        <Field name="confirm" type="password" label="Confirm password" required autoComplete="new-password" />
        <SubmitButton className="btn btn-primary w-full" pending="Creating account…">Create account</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
