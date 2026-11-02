import { requireStaff } from '@/server/rbac';
import { getSetting } from '@/server/settings';
import { db } from '@/server/db';
import { PageHeader, Alert } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { saveDepartmentsAction } from './actions';

export const metadata = { title: 'Departments' };

export default async function DepartmentsAdmin() {
  await requireStaff('settings.manage');
  const [depts, services] = await Promise.all([getSetting('departments'), db.service.findMany({ select: { name: true, department: true }, orderBy: { sortOrder: 'asc' } })]);
  return (
    <>
      <PageHeader title="Departments" eyebrow="Enquiry routing"><p>Every kind of enquiry is routed to a department. The department’s email address is told about each new enquiry; the enquiry also appears under Requests for the team. Leave an address blank to use the general new-request list.</p></PageHeader>
      <ActionForm action={saveDepartmentsAction} className="grid gap-6 max-w-3xl">
        {depts.map((d) => {
          const mine = services.filter((s) => s.department === d.key);
          return (
            <fieldset key={d.key} className="panel panel-pad grid gap-3">
              <legend className="sr-only">{d.label}</legend>
              <div className="flex flex-wrap items-baseline gap-2"><span className="mono text-xs text-steel">{d.key}</span><span className="text-sm text-steel">{mine.length ? `Receives: ${mine.map((m) => m.name).join(', ')}` : 'No request type is routed here yet.'}</span></div>
              <Field name={`label_${d.key}`} label="Name" defaultValue={d.label} required />
              <Field name={`email_${d.key}`} label="Email address(es)" defaultValue={d.email} hint="Separate several with commas." />
              <Field name={`desc_${d.key}`} label="What it handles" defaultValue={d.description} />
            </fieldset>
          );
        })}
        <details className="panel panel-pad"><summary className="cursor-pointer font-display font-bold min-h-[2.75rem] flex items-center">Add a department</summary>
          <div className="grid gap-3 mt-3"><Field name="new_key" label="Key" placeholder="projects" hint="Lower-case letters and dashes. It cannot be changed later." /><Field name="new_label" label="Name" /><Field name="new_email" label="Email address(es)" /><Field name="new_desc" label="What it handles" /></div></details>
        <div><SubmitButton pending="Saving…">Save departments</SubmitButton></div>
      </ActionForm>
      <div className="mt-6 max-w-3xl"><Alert tone="info">To change which department a kind of enquiry goes to, edit the request type under Request types.</Alert></div>
    </>
  );
}
