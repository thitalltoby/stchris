import { requireStaff } from '@/server/rbac';
import { PageHeader, Alert, Badge } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { getMfaStatus, pendingEnrollment, ISSUER } from '@/server/mfa';
import { getSetting } from '@/server/settings';
import { ROLE_LABELS } from '@/lib/permissions';
import { startEnrollmentAction, confirmEnrollmentAction, regenerateCodesAction, disableMfaAction } from './actions';

export const metadata = { title: 'Two-factor sign-in' };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const user = await requireStaff(undefined, { allowUnenrolled: true });
  const sp = await searchParams;
  const [status, policy] = await Promise.all([getMfaStatus(user.id), getSetting('security')]);
  const setup = status.pending ? await pendingEnrollment(user.id, user.email) : null;
  return (
    <>
      <PageHeader title="Two-factor sign-in" eyebrow={ROLE_LABELS[user.role]}><p>{user.name} · {user.email}</p></PageHeader>
      {(sp.required || (policy.requireStaffMfa && !status.enabled)) && <div className="mb-5 max-w-2xl"><Alert tone="warn">Two-factor sign-in is required for all staff. Turn it on below to continue using the console.</Alert></div>}
      <div className="grid gap-6 max-w-2xl">
        <section className="panel panel-pad">
          <div className="flex items-center justify-between gap-3 mb-3"><h2 className="!text-lg">Authenticator app</h2>{status.enabled ? <Badge tone="good">On</Badge> : <Badge tone="neutral">Off</Badge>}</div>
          {status.enabled ? (
            <p className="text-sm text-steel">Turned on {status.enabledAt?.toLocaleDateString('en-GB')}. You have {status.recoveryCodesLeft} unused recovery code{status.recoveryCodesLeft === 1 ? '' : 's'}.</p>
          ) : setup ? (
            <div className="space-y-4">
              <p className="text-sm">1. In an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…), add an account by scanning this code.</p>
              <div className="inline-block border border-line p-2" style={{ background: '#fff' }} dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
              <p className="text-sm">Cannot scan? Enter this key instead ({ISSUER}):</p>
              <p className="mono text-sm break-all select-all">{setup.secret.match(/.{1,4}/g)?.join(' ')}</p>
              <p className="text-sm">2. Enter the 6-digit code the app shows.</p>
              <ActionForm action={confirmEnrollmentAction} className="space-y-4"><Field name="code" label="6-digit code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} /><SubmitButton pending="Checking…">Turn on two-factor sign-in</SubmitButton></ActionForm>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-steel">Adds a 6-digit code from your phone to every sign-in, so a stolen password alone cannot open the console.</p>
              <ActionForm action={startEnrollmentAction} className=""><SubmitButton pending="Preparing…">Set up</SubmitButton></ActionForm>
            </div>
          )}
        </section>
        {status.enabled && (
          <>
            <section className="panel panel-pad"><h2 className="!text-lg mb-2">New recovery codes</h2><p className="text-sm text-steel mb-3">Replaces all existing recovery codes. Enter a current 6-digit code to confirm.</p>
              <ActionForm action={regenerateCodesAction} resetOnSuccess className="space-y-3"><Field name="code" label="6-digit code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} /><SubmitButton pending="Working…" className="btn btn-outline">Create new recovery codes</SubmitButton></ActionForm></section>
            {!policy.requireStaffMfa && (
              <section className="panel panel-pad"><h2 className="!text-lg mb-2">Turn off</h2>
                <ActionForm action={disableMfaAction} resetOnSuccess className="space-y-3"><Field name="password" type="password" label="Password" required autoComplete="current-password" /><Field name="code" label="6-digit code or recovery code" required autoComplete="one-time-code" /><SubmitButton pending="Working…" className="btn btn-danger">Turn off two-factor sign-in</SubmitButton></ActionForm></section>
            )}
          </>
        )}
      </div>
    </>
  );
}
