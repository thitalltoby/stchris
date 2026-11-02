import { requireInternal } from '@/server/rbac';
import { listDirectory } from '@/server/staff-portal';
import { getSetting } from '@/server/settings';
import { ROLE_LABELS } from '@/lib/permissions';
import { Empty } from '@/components/ui';

export const metadata = { title: 'Directory' };

export default async function Directory({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireInternal();
  const q = (await searchParams).q ?? '';
  const [people, depts] = await Promise.all([listDirectory(user, q), getSetting('departments')]);
  return (
    <>
      <h1 className="!text-3xl mb-1">Staff directory</h1>
      <p className="text-steel mb-6">Colleagues who have chosen to be listed. Contact details are visible to signed-in staff only.</p>
      <form role="search" className="flex gap-2 max-w-md mb-6"><label htmlFor="q" className="sr-only">Search the directory</label><input id="q" name="q" defaultValue={q} className="input flex-1" placeholder="Name, title, department or location" /><button className="btn btn-dark">Search</button></form>
      {people.length === 0 ? <Empty title="No one found" /> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <li key={p.id} className="panel panel-pad">
              <p className="font-display font-bold text-lg leading-tight">{p.name}</p>
              <p className="text-sm text-steel">{p.staffProfile?.jobTitle || ROLE_LABELS[p.role]}</p>
              <dl className="mt-3 text-sm space-y-1">
                {p.staffProfile?.department && <div><dt className="sr-only">Department</dt><dd>{depts.find((d) => d.key === p.staffProfile!.department)?.label ?? p.staffProfile.department}</dd></div>}
                {p.staffProfile?.location && <div><dt className="sr-only">Location</dt><dd>{p.staffProfile.location}</dd></div>}
                <div><dt className="sr-only">Email</dt><dd><a href={`mailto:${p.email}`}>{p.email}</a></dd></div>
                {p.staffProfile?.phone && <div><dt className="sr-only">Phone</dt><dd><a href={`tel:${p.staffProfile.phone.replace(/[^+\d]/g, '')}`}>{p.staffProfile.phone}</a></dd></div>}
              </dl>
              {p.staffProfile?.about && <p className="text-sm mt-3 text-steel">{p.staffProfile.about}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
