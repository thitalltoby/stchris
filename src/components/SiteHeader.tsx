import Link from 'next/link';
import { Logo } from './Logo';
import { Icon } from './Icon';
import { getSessionUser } from '@/server/session';
import { isStaff } from '@/lib/permissions';
import { getSetting } from '@/server/settings';
import { getListView } from '@/server/project-list';
import { getCategories } from '@/server/catalogue';
import { getDivisions } from '@/server/site-content';
import { getJournalCategories } from '@/server/journal';
import { db } from '@/server/db';
import { MainNav } from './MainNav';
import { buildNav } from '@/content/nav';

export async function SiteHeader() {
  const [user, company, list, cats, divisions, jcats, geepee] = await Promise.all([getSessionUser(), getSetting('company'), getListView(), getCategories(), getDivisions(), getJournalCategories(), db.article.count({ where: { slug: 'geepee-tanks-partnership', status: 'PUBLISHED' } })]);
  const account = user ? (user.role === 'STAFF_MEMBER' ? { href: '/staff', label: 'Staff portal' } : isStaff(user.role) ? { href: '/admin', label: 'Console' } : { href: '/portal', label: 'My portal' }) : { href: '/login', label: 'Sign in' };
  const nav = buildNav({ categories: cats, divisions, journalCategories: jcats, geepeeLive: geepee > 0 });
  return (
    <header className="bg-white border-b border-line sticky top-0 z-40 no-print">
      <div className="bg-umber text-paper/90 text-xs hidden md:block">
        <div className="container-x flex items-center justify-between py-1.5 min-w-0">
          <span className="eyebrow !text-paper/70 !tracking-[0.12em] truncate">{company.tagline}</span>
          <span className="flex gap-5 mono flex-none whitespace-nowrap pl-6">
            {company.phone && <a className="!text-paper/90 no-underline hover:!text-white" href={`tel:${company.phone.replace(/[^+\d]/g, '')}`}>{company.phone}</a>}
            <a className="!text-paper/90 no-underline hover:!text-white" href="https://sweethomebathrooms.com" rel="noopener noreferrer">Shop retail at Sweethome</a>
          </span>
        </div>
      </div>
      <div className="container-x flex items-center gap-3 py-3">
        <Link href="/" aria-label="St. Chris Global home" className="flex-none"><Logo height={38} /></Link>
        <MainNav nav={nav} account={account} listCount={list.count} />
        <div className="ml-auto xl:ml-0 flex items-center gap-2">
          <Link href="/search" className="btn btn-outline btn-sm !px-2.5" aria-label="Search the catalogue"><Icon name="search" size={18} /></Link>
          {/* wrapper carries the responsive display: the unlayered .btn rule would override utilities on the link itself */}
          <span className="hidden sm:inline-flex xl:inline-flex"><Link href={account.href} className="btn btn-outline btn-sm">{account.label}</Link></span>
          <Link href="/list" className="btn btn-primary btn-sm whitespace-nowrap md:!min-h-[2.75rem] md:!px-5">
            <Icon name="list" size={18} />Project list
            <span className="mono ml-0.5 inline-grid place-items-center min-w-[1.4rem] h-[1.4rem] rounded-full bg-umber text-white text-xs px-1" data-testid="list-count" aria-label={`${list.count} ${list.count === 1 ? 'line' : 'lines'} on your list`}>{list.count}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
