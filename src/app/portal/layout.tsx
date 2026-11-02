import Link from 'next/link';
import { requireCustomer } from '@/server/rbac';
import { Logo } from '@/components/Logo';
import { Alert } from '@/components/ui';
import { logoutAction } from '@/app/(site)/auth-actions';
import { SiteFooter } from '@/components/SiteFooter';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'Portal', template: '%s · St. Chris Portal' }, robots: { index: false, follow: false } };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();
  const nav = [['/portal', 'Overview'], ['/portal/requests', 'My requests'], ['/request', 'New request'], ['/portal/account', 'Account']];
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="bg-paper border-b border-line no-print">
        <div className="container-x flex flex-wrap items-center justify-between gap-3 py-3">
          <Link href="/portal" aria-label="St. Chris portal home"><Logo height={36} /></Link>
          <nav aria-label="Portal" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.95rem] font-medium">
            {nav.map(([h, l]) => <Link key={h} href={h} className="!text-charcoal no-underline hover:!text-ember">{l}</Link>)}
            <form action={logoutAction}><button className="underline text-ember">Sign out</button></form>
          </nav>
        </div>
      </header>
      <main id="main" className="container-x py-8 md:py-12 min-h-[60vh]">
        {!user.emailVerified && <div className="mb-6"><Alert tone="warn">Your email address is not confirmed yet. Requests you sent as a guest appear here once you confirm it.</Alert></div>}
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
