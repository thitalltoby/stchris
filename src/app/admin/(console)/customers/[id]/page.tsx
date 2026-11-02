import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/server/rbac';
import { getCompany, listStaff } from '@/server/customers';
import { AppError } from '@/server/errors';
import { PageHeader, StatusBadge, QuotationBadge, Badge } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { can } from '@/lib/permissions';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { saveCompanyAction, saveContactAction, addNoteAction } from '../actions';
import { createTaskAction } from '../../requests/actions';

export const metadata = { title: 'Customer' };

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff('customer.view');
  const { id } = await params;
  let c;
  try { c = await getCompany(user, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  const staff = await listStaff();
  const edit = can(user.role, 'customer.edit');
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/admin/customers">← All customers</Link></p>
      <PageHeader title={c.name} eyebrow="Customer">{c.industry && <p>{c.industry}</p>}</PageHeader>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6 min-w-0">
          <section className="panel panel-pad"><h2 className="!text-lg mb-4">Requests</h2>
            {c.requests.length === 0 ? <p className="text-sm text-steel">None.</p> : <div className="table-wrap"><table className="dt"><tbody>{c.requests.map((r) => <tr key={r.id}><td><Link href={`/admin/requests/${r.id}`} className="mono font-medium">{r.reference}</Link></td><td>{r.service.name}</td><td className="mono text-xs">{fmtDate(r.submittedAt)}</td><td><StatusBadge status={r.status} /></td></tr>)}</tbody></table></div>}
          </section>
          <section className="panel panel-pad"><h2 className="!text-lg mb-4">Quotations</h2>
            {c.quotations.length === 0 ? <p className="text-sm text-steel">None.</p> : <div className="table-wrap"><table className="dt"><tbody>{c.quotations.map((q) => { const rev = q.revisions[0]; return <tr key={q.id}><td><Link href={`/admin/quotations/${q.id}`} className="mono font-medium">{q.number}</Link></td><td className="mono">{q.request.reference}</td><td className="num">{rev ? formatMoney(rev.total.toString(), rev.currency) : '—'}</td><td><QuotationBadge status={q.status} /></td></tr>; })}</tbody></table></div>}
          </section>
          <section className="panel panel-pad"><h2 className="!text-lg mb-4">Contact history</h2>
            {c.communications.length === 0 ? <p className="text-sm text-steel">None.</p> : <ul className="divide-y divide-line">{c.communications.map((m) => <li key={m.id} className="py-3 text-sm"><strong>{m.type}</strong> · {m.authorLabel} · <span className="mono text-xs text-steel">{fmtDateTime(m.occurredAt)}</span><p className="mt-1 whitespace-pre-wrap">{m.body}</p></li>)}</ul>}
            {edit && <ActionForm action={addNoteAction} resetOnSuccess className="mt-4 pt-4 border-t border-line space-y-3"><input type="hidden" name="companyId" value={c.id} />
              <Field name="type" type="select" label="Type" defaultValue="NOTE" options={[{ value: 'NOTE', label: 'Note' }, { value: 'CALL', label: 'Call' }, { value: 'MEETING', label: 'Meeting' }]} />
              <Field name="body" type="textarea" label="Details" required rows={3} /><SubmitButton className="btn btn-outline btn-sm">Add</SubmitButton></ActionForm>}
          </section>
        </div>
        <div className="space-y-6 min-w-0">
          <section className="panel rule-top panel-pad"><h2 className="!text-lg mb-4">Company details</h2>
            {edit ? (
              <ActionForm action={saveCompanyAction} className="space-y-3"><input type="hidden" name="id" value={c.id} />
                <Field name="name" label="Name" defaultValue={c.name} required /><Field name="industry" label="Industry" defaultValue={c.industry} /><Field name="website" label="Website" defaultValue={c.website} />
                <Field name="address" type="textarea" rows={2} label="Address" defaultValue={c.address} /><Field name="notes" type="textarea" rows={3} label="Internal notes" defaultValue={c.notes} />
                <Field name="ownerId" type="select" label="Relationship owner" defaultValue={c.ownerId ?? ''} options={[{ value: '', label: 'None' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} />
                <SubmitButton className="btn btn-outline btn-sm">Save</SubmitButton></ActionForm>
            ) : <dl className="kv"><dt>Website</dt><dd>{c.website ?? '—'}</dd><dt>Address</dt><dd>{c.address ?? '—'}</dd><dt>Owner</dt><dd>{c.owner?.name ?? '—'}</dd></dl>}
          </section>
          <section className="panel panel-pad"><h2 className="!text-lg mb-3">Contacts</h2>
            <ul className="divide-y divide-line">{c.contacts.map((p) => <li key={p.id} className="py-2.5 text-sm"><span className="font-medium">{p.name}</span> {p.user && <Badge tone={p.user.emailVerifiedAt ? 'good' : 'warn'}>{p.user.emailVerifiedAt ? 'Portal user' : 'Portal: unverified'}</Badge>}<span className="block text-steel">{p.jobTitle ? `${p.jobTitle} · ` : ''}<a href={`mailto:${p.email}`}>{p.email}</a>{p.phone ? ` · ${p.phone}` : ''}</span></li>)}</ul>
            {edit && <details className="mt-3"><summary className="cursor-pointer text-ember text-sm font-medium">Add a contact</summary>
              <ActionForm action={saveContactAction} resetOnSuccess className="mt-3 space-y-3"><input type="hidden" name="companyId" value={c.id} /><Field name="name" label="Name" required /><Field name="email" type="email" label="Email" required /><Field name="phone" type="tel" label="Phone" /><Field name="jobTitle" label="Job title" /><SubmitButton className="btn btn-outline btn-sm">Add contact</SubmitButton></ActionForm></details>}
          </section>
          <section className="panel panel-pad"><h2 className="!text-lg mb-3">Open follow-ups</h2>
            {c.tasks.length === 0 ? <p className="text-sm text-steel">None.</p> : <ul className="text-sm space-y-2">{c.tasks.map((t) => <li key={t.id}><strong>{t.title}</strong> · due {fmtDate(t.dueAt)}</li>)}</ul>}
            {can(user.role, 'task.manage') && <ActionForm action={createTaskAction} resetOnSuccess className="mt-4 pt-4 border-t border-line space-y-3"><input type="hidden" name="companyId" value={c.id} /><Field name="title" label="New follow-up" required /><Field name="dueAt" type="date" label="Due date" required /><SubmitButton className="btn btn-outline btn-sm">Add</SubmitButton></ActionForm>}
          </section>
        </div>
      </div>
    </>
  );
}
