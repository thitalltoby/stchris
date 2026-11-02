import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { listCompanies } from '@/server/customers';
import { PageHeader, Pagination, Empty, qs } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { can } from '@/lib/permissions';
import { saveCompanyAction } from './actions';

export const metadata = { title: 'Customers' };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireStaff('customer.view');
  const sp = await searchParams;
  const data = await listCompanies(user, { q: sp.q, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="Customers" eyebrow={`${data.total} companies`} />
      <form className="panel panel-pad mb-5 flex gap-4 items-end" method="get"><div className="grow max-w-md"><label className="label" htmlFor="q">Search companies and contacts</label><input id="q" name="q" className="input" defaultValue={sp.q} /></div><button className="btn btn-dark">Search</button></form>
      {data.items.length === 0 ? <Empty title="No customers yet">Companies are created automatically from requests and registrations.</Empty> : (
        <div className="table-wrap"><table className="dt"><caption className="sr-only">Customers</caption><thead><tr><th>Company</th><th>Industry</th><th>Owner</th><th className="num">Contacts</th><th className="num">Requests</th><th className="num">Quotations</th></tr></thead>
          <tbody>{data.items.map((c) => <tr key={c.id}><td><Link href={`/admin/customers/${c.id}`} className="font-medium">{c.name}</Link></td><td>{c.industry ?? '—'}</td><td>{c.owner?.name ?? '—'}</td><td className="num">{c._count.contacts}</td><td className="num">{c._count.requests}</td><td className="num">{c._count.quotations}</td></tr>)}</tbody></table></div>
      )}
      <Pagination page={data.page} pages={data.pages} hrefFor={(p) => `/admin/customers${qs({ q: sp.q, page: p })}`} />
      {can(user.role, 'customer.edit') && (
        <details className="panel panel-pad mt-8"><summary className="cursor-pointer font-display font-bold">Add a company manually</summary>
          <ActionForm action={saveCompanyAction} className="mt-4 grid gap-4 sm:grid-cols-2 max-w-2xl"><Field name="name" label="Company name" required className="sm:col-span-2" /><Field name="industry" label="Industry" /><Field name="website" label="Website" /><SubmitButton>Create company</SubmitButton></ActionForm>
        </details>
      )}
    </>
  );
}
