import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { db } from '@/server/db';
import { PageHeader, Badge } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { saveServiceAction } from './actions';

export const metadata = { title: 'Services' };

export default async function ServicesAdmin() {
  await requireStaff('service.manage');
  const services = await db.service.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { fields: true, requests: true } } } });
  return (
    <>
      <PageHeader title="Services" eyebrow="Public content and request forms"><p>Each service defines what the public site says and which questions the request builder asks. Changes go live immediately.</p></PageHeader>
      <div className="table-wrap"><table className="dt"><caption className="sr-only">Services</caption><thead><tr><th>Request type</th><th>Group</th><th className="num">Fields</th><th className="num">Requests</th><th>Status</th></tr></thead>
        <tbody>{services.map((s) => <tr key={s.id}><td><Link href={`/admin/services/${s.id}`} className="font-medium">{s.name}</Link></td><td>{s.pillar}</td><td className="num">{s._count.fields}</td><td className="num">{s._count.requests}</td>
          <td className="space-x-1">{s.visible ? <Badge tone="good">Visible</Badge> : <Badge>Hidden</Badge>}{s.needsReview && <Badge tone="warn">Needs St. Chris review</Badge>}</td></tr>)}</tbody></table></div>
      <details className="panel panel-pad mt-8"><summary className="cursor-pointer font-display font-bold">Add a service</summary>
        <ActionForm action={saveServiceAction} className="mt-4 grid gap-4 max-w-3xl">
          <Field name="name" label="Name" required /><Field name="pillar" label="Group" required defaultValue="Quotation" /><Field name="acceptsItems" type="checkbox" label="Carries the customer’s project list" /><Field name="summary" label="Summary" required type="textarea" rows={2} />
          <Field name="description" label="Description (Markdown)" type="textarea" required rows={6} /><Field name="sortOrder" type="number" label="Order" defaultValue={services.length + 1} /><Field name="visible" type="checkbox" label="Visible on the public site" defaultValue />
          <SubmitButton>Create service</SubmitButton>
        </ActionForm></details>
    </>
  );
}
