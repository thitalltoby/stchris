import { requireStaff } from '@/server/rbac';
import { listOpportunitiesAdmin, OPPORTUNITY_KINDS } from '@/server/site-content';
import { PageHeader, Badge, Empty } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { saveOpportunityAction, deleteOpportunityAction } from './actions';
import { fmtDate } from '@/lib/format';

export const metadata = { title: 'Opportunities' };
type Opp = Awaited<ReturnType<typeof listOpportunitiesAdmin>>[number];
const kinds = Object.entries(OPPORTUNITY_KINDS).map(([value, label]) => ({ value, label }));

export default async function OpportunitiesAdmin() {
  await requireStaff('opportunity.manage');
  const rows = await listOpportunitiesAdmin();
  return (
    <>
      <PageHeader title="Opportunities" eyebrow="Business development"><p>Partnership, distribution, supplier, procurement, investment and career opportunities. Each published one gets its own page and an “Express interest” button that opens the right enquiry form. Replies to those forms arrive as enquiries under Requests.</p></PageHeader>
      {rows.length === 0 ? <Empty title="No opportunities yet" /> : (
        <ul className="grid gap-3 mb-8">
          {rows.map((o) => (
            <li key={o.id} className="panel"><details>
              <summary className="p-4 cursor-pointer flex flex-wrap gap-2 items-center min-h-[2.75rem]"><Badge tone={o.status === 'PUBLISHED' ? 'good' : 'neutral'}>{o.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Badge><Badge>{OPPORTUNITY_KINDS[o.kind] ?? o.kind}</Badge><span className="font-semibold">{o.title}</span>{o.closesOn && <span className="text-sm text-steel">closes {fmtDate(o.closesOn)}</span>}</summary>
              <div className="p-4 pt-0"><OppForm o={o} />
                <ActionForm action={deleteOpportunityAction} className="mt-3"><input type="hidden" name="id" value={o.id} /><SubmitButton className="btn btn-danger btn-sm" pending="Deleting…">Delete</SubmitButton></ActionForm></div>
            </details></li>
          ))}
        </ul>
      )}
      <details className="panel panel-pad"><summary className="cursor-pointer font-display font-bold min-h-[2.75rem] flex items-center">Add an opportunity</summary><div className="mt-4"><OppForm /></div></details>
    </>
  );
}

function OppForm({ o }: { o?: Opp }) {
  return (
    <ActionForm action={saveOpportunityAction} resetOnSuccess={!o} className="grid gap-4 max-w-2xl">
      {o && <input type="hidden" name="id" value={o.id} />}
      <Field name="kind" label="Type" type="select" options={kinds} defaultValue={o?.kind ?? 'PARTNERSHIP'} />
      <Field name="title" label="Title" required defaultValue={o?.title ?? ''} />
      <Field name="summary" label="Short summary" type="textarea" rows={2} required defaultValue={o?.summary ?? ''} />
      <Field name="body" label="Details" type="textarea" rows={8} defaultValue={o?.body ?? ''} hint="What is being sought, who it suits, how to apply. Blank line between paragraphs." />
      <div className="grid gap-4 sm:grid-cols-2"><Field name="location" label="Location" defaultValue={o?.location ?? ''} /><Field name="closesOn" label="Closes on" type="date" defaultValue={o?.closesOn ? o.closesOn.toISOString().slice(0, 10) : ''} /></div>
      <Field name="publish" label="Publish on the site" type="checkbox" defaultValue={o?.status === 'PUBLISHED'} />
      <div><SubmitButton pending="Saving…">{o ? 'Save changes' : 'Add opportunity'}</SubmitButton></div>
    </ActionForm>
  );
}
