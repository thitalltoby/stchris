import { requireStaff } from '@/server/rbac';
import { AdminShell } from '@/components/AdminShell';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'Console', template: '%s · St. Chris Console' }, robots: { index: false, follow: false } };

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff(); // every page repeats its own permission check; this only gates the shell
  return <AdminShell user={user}>{children}</AdminShell>;
}
