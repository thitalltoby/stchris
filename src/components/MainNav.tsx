'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import type { NavNode } from '@/content/nav';

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));

/** A row that expands and collapses a group. Used for the dropdown panels (desktop) and the menu (mobile). */
function Group({ node, level, path, defaultOpen = true }: { node: NavNode; level: 1 | 2; path: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="nav-group" data-open={open}>
      <button type="button" className={`nav-row nav-row-${level}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span>{node.label}</span>
        <Icon name="chevron" size={18} className={`nav-chev ${open ? 'is-up' : 'is-down'}`} />
      </button>
      <div id={id} hidden={!open} className="nav-sub">
        <NavLinks node={node} level={(level + 1) as 2 | 3} path={path} />
      </div>
    </div>
  );
}

function NavLinks({ node, level, path }: { node: NavNode; level: 1 | 2 | 3; path: string }) {
  return (
    <>
      <Link href={node.href} className={`nav-row nav-goto nav-row-${level}`} aria-current={path === node.href ? 'page' : undefined}>Go to: {node.label}</Link>
      {node.children?.map((c) =>
        c.children ? <Group key={c.href} node={c} level={Math.min(level, 2) as 1 | 2} path={path} /> : (
          <Link key={c.href} href={c.href} className={`nav-row nav-row-${level}`} aria-current={path === c.href ? 'page' : undefined}>{c.label}</Link>
        ),
      )}
    </>
  );
}

export function MainNav({ nav, account, listCount = 0 }: { nav: NavNode[]; account: { href: string; label: string }; listCount?: number }) {
  const path = usePathname();
  const [openTop, setOpenTop] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = useCallback(() => { setOpenTop(null); setMenu(false); }, []);

  // close any open menu when the page changes (adjusting state during render is the React-recommended way)
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) { setSeenPath(path); setOpenTop(null); setMenu(false); }
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const trigger = wrap.current?.querySelector<HTMLElement>('[aria-expanded="true"][data-top]');
      close();
      trigger?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [close]);

  return (
    <div ref={wrap} className="contents" onBlur={(e) => { if (wrap.current && !wrap.current.contains(e.relatedTarget as Node | null) && e.relatedTarget) close(); }}>
      {/* Desktop: a row of links and dropdown buttons */}
      <nav aria-label="Main" className="hidden xl:flex xl:flex-1 xl:justify-center items-center gap-1 text-[0.95rem] font-medium">
        {nav.map((n) =>
          n.children ? (
            <div key={n.href} className="relative">
              <button type="button" data-top className={`nav-top ${isActive(path, n.href) ? 'is-current' : ''}`} aria-expanded={openTop === n.href} aria-controls={`${panelId}-${n.label}`} onClick={() => setOpenTop(openTop === n.href ? null : n.href)}>
                {n.label}<Icon name="chevron" size={16} className={`nav-chev ${openTop === n.href ? 'is-up' : 'is-down'}`} />
              </button>
              <div id={`${panelId}-${n.label}`} hidden={openTop !== n.href} className="nav-panel nav-panel-desktop">
                <NavLinks node={n} level={1} path={path} />
              </div>
            </div>
          ) : (
            <Link key={n.href} href={n.href} className={`nav-top ${isActive(path, n.href) ? 'is-current' : ''}`} aria-current={isActive(path, n.href) ? 'page' : undefined}>{n.label}</Link>
          ),
        )}
      </nav>

      {/* Mobile and tablet: one button that opens the full menu */}
      <div className="xl:hidden order-last">
        <button type="button" className="btn btn-outline btn-sm !px-2.5" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} aria-controls={`${panelId}-mobile`} onClick={() => setMenu(!menu)}>
          <Icon name={menu ? 'x' : 'menu'} />
        </button>
        <nav id={`${panelId}-mobile`} aria-label="Main menu" hidden={!menu} className="nav-panel nav-panel-mobile">
          {nav.map((n) =>
            n.children ? <Group key={n.href} node={n} level={1} path={path} defaultOpen={false} /> : (
              <Link key={n.href} href={n.href} className="nav-row nav-row-1" aria-current={isActive(path, n.href) ? 'page' : undefined}>{n.label}</Link>
            ),
          )}
          <div className="nav-foot">
            <Link href={account.href} className="nav-row nav-row-1">{account.label}</Link>
            <Link href="/list" className="btn btn-primary w-full mt-2">Project list ({listCount})</Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
