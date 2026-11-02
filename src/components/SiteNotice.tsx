import Link from 'next/link';
import { getSetting } from '@/server/settings';
import { noticeVisible } from '@/lib/notice';
import { Icon } from './Icon';

/** Staff-written announcement above the header. Renders nothing unless switched on and not past its end date. */
export async function SiteNotice() {
  const n = await getSetting('notice');
  if (!noticeVisible(n)) return null;
  const external = n.href.startsWith('https://');
  return (
    <aside aria-label="Announcement" className="bg-brand text-umber no-print">
      <div className="container-x py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.95rem]">
        <p className="m-0 !text-umber">{n.text}</p>
        {n.href && (external
          ? <a href={n.href} rel="noopener noreferrer" className="!text-umber font-display font-semibold underline underline-offset-4 inline-flex items-center gap-1.5 min-h-[2.75rem] md:min-h-0">{n.linkLabel}<Icon name="arrow" size={16} /></a>
          : <Link href={n.href} className="!text-umber font-display font-semibold underline underline-offset-4 inline-flex items-center gap-1.5 min-h-[2.75rem] md:min-h-0">{n.linkLabel}<Icon name="arrow" size={16} /></Link>)}
      </div>
    </aside>
  );
}
