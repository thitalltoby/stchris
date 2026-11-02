import Link from 'next/link';
import { Icon } from './Icon';
import { Logo } from './Logo';
import type { SessionUser } from '@/server/session';
import { can, ROLE_LABELS, type Permission } from '@/lib/permissions';
import { logoutAction } from '@/app/(site)/auth-actions';

const NAV: { href: string; label: string; icon: string; perm: Permission[] }[] = [
  { href: '/admin', label: 'Dashboard', icon: 'gauge', perm: ['report.view', 'request.view.assigned', 'journal.write', 'journal.publish', 'analytics.view'] },
  { href: '/admin/requests', label: 'Requests', icon: 'list', perm: ['request.view.all', 'request.view.assigned'] },
  { href: '/admin/quotations', label: 'Quotations', icon: 'receipt', perm: ['quotation.view'] },
  { href: '/admin/customers', label: 'Customers', icon: 'briefcase', perm: ['customer.view'] },
  { href: '/admin/tasks', label: 'Follow-ups', icon: 'clock', perm: ['task.manage'] },
  { href: '/admin/catalogue', label: 'Catalogue', icon: 'layers', perm: ['catalogue.manage'] },
  { href: '/admin/services', label: 'Request types', icon: 'briefcase', perm: ['service.manage'] },
  { href: '/admin/journal', label: 'Journal', icon: 'book', perm: ['journal.write', 'journal.publish'] },
  { href: '/admin/journal/social', label: 'Social queue', icon: 'send', perm: ['social.publish', 'social.manage'] },
  { href: '/admin/media-centre', label: 'Media centre', icon: 'megaphone', perm: ['media.manage'] },
  { href: '/admin/profile', label: 'Executive profile', icon: 'user', perm: ['profile.manage'] },
  { href: '/admin/divisions', label: 'Divisions', icon: 'container', perm: ['division.manage'] },
  { href: '/admin/opportunities', label: 'Opportunities', icon: 'briefcase', perm: ['opportunity.manage'] },
  { href: '/admin/content', label: 'Content', icon: 'file', perm: ['content.manage'] },
  { href: '/admin/seo', label: 'SEO', icon: 'globe', perm: ['seo.manage'] },
  { href: '/admin/staff-portal', label: 'Staff portal', icon: 'bell', perm: ['staffportal.manage'] },
  { href: '/admin/insights', label: 'Insights', icon: 'chart', perm: ['analytics.view'] },
  { href: '/admin/reports', label: 'Reports', icon: 'chart', perm: ['report.view'] },
  { href: '/admin/users', label: 'Users', icon: 'users', perm: ['user.manage'] },
  { href: '/admin/integrations', label: 'Integrations', icon: 'plug', perm: ['integration.manage'] },
  { href: '/admin/notifications', label: 'Email outbox', icon: 'mail', perm: ['settings.manage'] },
  { href: '/admin/audit', label: 'Audit log', icon: 'log', perm: ['audit.view'] },
  { href: '/admin/departments', label: 'Departments', icon: 'users', perm: ['settings.manage'] },
  { href: '/admin/settings', label: 'Settings', icon: 'settings', perm: ['settings.manage'] },
];

export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const items = NAV.filter((n) => n.perm.some((p) => can(user.role, p)));
  const nav = (
    <ul className="space-y-0.5">
      {items.map((n) => (
        <li key={n.href}><Link href={n.href} className="flex items-center gap-3 px-3 py-2.5 text-[0.93rem] !text-paper/85 no-underline hover:bg-white/10 hover:!text-white rounded-sm"><Icon name={n.icon} size={18} />{n.label}</Link></li>
      ))}
    </ul>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15.5rem_1fr] bg-paper">
      <a href="#admin-main" className="skip-link">Skip to content</a>
      <aside className="hidden lg:flex flex-col bg-charcoal text-paper sticky top-0 h-screen no-print">
        <div className="p-5 border-b border-white/10"><Link href="/admin"><Logo reversed height={34} /></Link><p className="eyebrow !text-brand mt-3">Materials Desk</p></div>
        <nav aria-label="Console" className="flex-1 overflow-y-auto p-3">{nav}</nav>
        <UserBlock user={user} />
      </aside>
      <div className="min-w-0 flex flex-col">
        <header className="lg:hidden bg-charcoal text-paper flex items-center justify-between px-4 py-3 no-print">
          <Link href="/admin"><Logo reversed height={28} /></Link>
          <details className="relative">
            <summary className="list-none cursor-pointer p-2 border border-white/30 rounded-sm" aria-label="Menu"><Icon name="menu" /></summary>
            <div className="absolute right-0 top-full mt-2 w-64 bg-charcoal border border-white/15 p-2 z-50 shadow-xl max-h-[80vh] overflow-y-auto">{nav}<div className="border-t border-white/10 mt-2"><UserBlock user={user} /></div></div>
          </details>
        </header>
        <main id="admin-main" className="flex-1 p-4 md:p-8 max-w-[88rem] w-full">{children}</main>
      </div>
    </div>
  );
}

function UserBlock({ user }: { user: SessionUser }) {
  return (
    <div className="p-4 border-t border-white/10 text-sm">
      <p className="font-medium truncate">{user.name}</p>
      <p className="text-paper/60 text-xs truncate">{ROLE_LABELS[user.role]}</p>
      <div className="flex gap-3 mt-3 items-center">
        <Link href="/admin/account" className="!text-paper/80 text-xs underline">Account</Link>
        <Link href="/" className="!text-paper/80 text-xs underline">Public site</Link>
        <form action={logoutAction} className="ml-auto"><button className="text-xs underline text-paper/80 hover:text-white flex items-center gap-1"><Icon name="logout" size={14} />Sign out</button></form>
      </div>
    </div>
  );
}
