import { requireStaff } from '@/server/rbac';
import { listUsers } from '@/server/users';
import { PageHeader, Badge } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, STAFF_ROLES, ROLE_PERMISSIONS } from '@/lib/permissions';
import { fmtDateTime } from '@/lib/format';
import { createUserAction, updateUserAction, resetMfaAction } from './actions';

export const metadata = { title: 'Users' };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string }> }) {
  const me = await requireStaff('user.manage');
  const sp = await searchParams;
  const users = await listUsers(me, { q: sp.q, role: sp.role });
  const staff = users.filter((u) => u.role !== 'CUSTOMER');
  const customers = users.filter((u) => u.role === 'CUSTOMER');
  const roleOpts = [...STAFF_ROLES, 'STAFF_MEMBER' as const].map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  return (
    <>
      <PageHeader title="Users and roles" eyebrow="Access"><p>Staff accounts and their roles. Role changes and deactivation end that person’s sessions immediately.</p></PageHeader>
      <section className="panel panel-pad mb-8"><h2 className="!text-lg mb-4">Add a staff user</h2>
        <ActionForm action={createUserAction} resetOnSuccess className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <Field name="name" label="Full name" required /><Field name="email" type="email" label="Work email" required /><Field name="role" type="select" label="Role" defaultValue="OPS_STAFF" options={roleOpts} /><Field name="approvalLimit" label="Approval limit (optional)" hint="Approvers only" />
          <div className="sm:col-span-2 lg:col-span-4"><SubmitButton>Create and email invitation</SubmitButton></div>
        </ActionForm>
      </section>
      <div className="table-wrap"><table className="dt"><caption className="sr-only">Staff</caption><thead><tr><th>Name</th><th>Role</th><th>Approval limit</th><th>Last sign-in</th><th>Status</th><th>Two-factor</th></tr></thead>
        <tbody>{staff.map((u) => (
          <tr key={u.id}><td><span className="font-medium">{u.name}</span><span className="block text-xs text-steel">{u.email}</span></td>
            <td colSpan={3}>
              <ActionForm action={updateUserAction} hideBanner={false} className="flex flex-wrap items-end gap-2"><input type="hidden" name="userId" value={u.id} />
                <div className="min-w-44"><label className="sr-only" htmlFor={`r-${u.id}`}>Role for {u.name}</label><select id={`r-${u.id}`} name="role" className="select" defaultValue={u.role}>{roleOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                <div className="w-36"><label className="sr-only" htmlFor={`l-${u.id}`}>Approval limit for {u.name}</label><input id={`l-${u.id}`} name="approvalLimit" className="input mono" defaultValue={u.approvalLimit?.toString() ?? ''} placeholder="No limit" /></div>
                <div className="w-36"><label className="sr-only" htmlFor={`a-${u.id}`}>Status for {u.name}</label><select id={`a-${u.id}`} name="isActive" className="select" defaultValue={String(u.isActive)}><option value="true">Active</option><option value="false">Deactivated</option></select></div>
                <SubmitButton className="btn btn-outline btn-sm">Save</SubmitButton><span className="text-xs text-steel">{u.lastLoginAt ? `Last in ${fmtDateTime(u.lastLoginAt)}` : 'Never signed in'}</span>
              </ActionForm></td>
            <td>{u.isActive ? <Badge tone="good">Active</Badge> : <Badge tone="neutral">Deactivated</Badge>}</td>
            <td>{u.mfaEnabledAt ? (<div className="flex flex-col gap-1"><Badge tone="good">On</Badge><ActionForm action={resetMfaAction} className=""><input type="hidden" name="userId" value={u.id} /><SubmitButton className="text-xs underline" pending="Resetting…">Reset</SubmitButton></ActionForm></div>) : <Badge tone="neutral">Off</Badge>}</td></tr>))}</tbody></table></div>
      <p className="mt-4 text-sm text-steel">{customers.length} customer portal accounts exist. Customers manage their own accounts.</p>
      <section className="mt-10"><h2 className="!text-lg mb-4">What each role can do</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{STAFF_ROLES.map((r) => <div key={r} className="panel panel-pad"><h3>{ROLE_LABELS[r]}</h3><p className="text-sm text-steel mt-1">{ROLE_DESCRIPTIONS[r]}</p><p className="mono text-xs text-steel mt-3 break-words">{ROLE_PERMISSIONS[r].join(' · ')}</p></div>)}</div></section>
    </>
  );
}
