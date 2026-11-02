import { requireCustomer } from '@/server/rbac';
import { getPortalAccount } from '@/server/portal';
import { PageHeader, Badge } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { fmtDate } from '@/lib/format';
import { inviteAction } from '../actions';
import { changePasswordCustomerAction } from '@/app/admin/(console)/account/actions';

export const metadata = { title: 'Account' };

export default async function PortalAccount() {
  const user = await requireCustomer();
  const ms = await getPortalAccount(user.id);
  return (
    <>
      <PageHeader title="Account" eyebrow={user.email} />
      <div className="grid gap-6 lg:grid-cols-2">
        {ms.map((m) => (
          <section key={m.id} className="panel panel-pad"><h2 className="!text-lg mb-3">{m.company.name} {m.role === 'OWNER' && <Badge tone="info">Owner</Badge>}</h2>
            <p className="eyebrow mb-2">People with access</p>
            <ul className="text-sm divide-y divide-line">{m.company.memberships.map((x) => <li key={x.id} className="py-2">{x.user.name} <span className="text-steel">· {x.user.email}</span></li>)}</ul>
            {m.company.invites.length > 0 && <><p className="eyebrow mt-4 mb-2">Pending invitations</p><ul className="text-sm">{m.company.invites.map((i) => <li key={i.id}>{i.email} <span className="text-steel">· expires {fmtDate(i.expiresAt)}</span></li>)}</ul></>}
            {m.role === 'OWNER' && <ActionForm action={inviteAction} resetOnSuccess className="mt-5 pt-5 border-t border-line space-y-3"><input type="hidden" name="companyId" value={m.companyId} /><Field name="email" type="email" label="Invite a colleague" required hint="They see this company’s requests and quotations." /><SubmitButton className="btn btn-outline btn-sm">Send invitation</SubmitButton></ActionForm>}
          </section>
        ))}
        <section className="panel panel-pad"><h2 className="!text-lg mb-4">Change password</h2>
          <ActionForm action={changePasswordCustomerAction} resetOnSuccess className="space-y-4"><Field name="current" type="password" label="Current password" required autoComplete="current-password" /><Field name="next" type="password" label="New password" required autoComplete="new-password" hint="At least 12 characters." /><Field name="confirm" type="password" label="Confirm new password" required autoComplete="new-password" /><SubmitButton>Change password</SubmitButton></ActionForm></section>
      </div>
    </>
  );
}
