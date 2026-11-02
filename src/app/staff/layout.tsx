import Link from 'next/link';
import { requireInternal } from '@/server/rbac';
import { isStaff } from '@/lib/permissions';
import { unreadCount } from '@/server/staff-portal';
import { Logo } from '@/components/Logo';
import { logoutAction } from '@/app/(site)/auth-actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'Staff portal', template: '%s · St. Chris staff' }, robots: { index: false, follow: false } };

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireInternal();
  const unread = await unreadCount(user);
  const nav: [string, string][] = [['/staff', 'Updates'], ['/staff/directory', 'Directory'], ['/staff/documents', 'Documents'], ['/staff/profile', 'My profile']];
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="bg-paper border-b border-line no-print">
        <div className="container-x flex flex-wrap items-center justify-between gap-3 py-3">
          <Link href="/staff" aria-label="St. Chris staff portal home" className="flex items-center gap-3"><Logo height={36} /><span className="hidden sm:inline text-sm font-semibold text-steel border-l border-line pl-3">Staff portal</span></Link>
          <nav aria-label="Staff portal" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.95rem] font-medium">
            {nav.map(([h, l]) => <Link key={h} href={h} className="!text-charcoal no-underline hover:!text-ember py-2">{l}{h === '/staff' && unread > 0 && <span className="ml-1.5 inline-block min-w-[1.4rem] text-center rounded-full bg-ember text-white text-xs px-1.5 py-0.5" aria-label={`${unread} unread`}>{unread}</span>}</Link>)}
            {isStaff(user.role) && <Link href="/admin" className="!text-charcoal no-underline hover:!text-ember py-2">Console</Link>}
            <form action={logoutAction}><button className="underline text-ember py-2">Sign out</button></form>
          </nav>
        </div>
      </header>
      <main id="main" className="container-x py-8 md:py-12 min-h-[60vh]">{children}</main>
      <footer className="border-t border-line py-6 text-sm text-steel"><div className="container-x">Internal use only. Do not share what you read here outside St. Chris Global Limited.</div></footer>
    </>
  );
}
