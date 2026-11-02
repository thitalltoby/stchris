import Link from 'next/link';
import { Logo } from './Logo';
import { getSetting } from '@/server/settings';
import { getCategories } from '@/server/catalogue';
import { CookieSettingsButton } from './ConsentAnalytics';
import { getDivisions } from '@/server/site-content';
import { SocialLinks } from './editorial';

const LINK = '!text-paper/85 hover:!text-white foot-link no-underline hover:underline';

export async function SiteFooter({ cookieSettings = false }: { cookieSettings?: boolean }) {
  const [c, cats, exec, divisions] = await Promise.all([getSetting('company'), getCategories(), getSetting('executive'), getDivisions()]);
  const waDigits = c.whatsapp.replace(/\D/g, '');
  const wa = /^[1-9]\d{9,14}$/.test(waDigits) ? waDigits : ''; // needs the country code; a local 0… number would give a broken chat link
  const hasContact = c.address || c.phone || c.email || wa || c.officeHours;
  return (
    <footer className="bg-umber text-paper no-print border-t-4 border-brand on-dark">
      <div className="container-x pt-16 md:pt-24 pb-4">
        <p className="serif text-[clamp(1.8rem,4.2vw,3.4rem)] leading-[1.05] tracking-tight max-w-4xl">{exec.closing}</p>
        <SocialLinks links={exec} className="mt-8 text-paper" />
      </div>
      <div className="container-x py-14 md:py-16 grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.2fr]">
        <div>
          <Logo reversed height={44} />
          <p className="mt-5 text-paper/80 max-w-xs text-[0.95rem]">{c.tagline}</p>
          <p className="mt-4 text-paper/70 max-w-xs text-sm">Retail customers can also shop at <a className="!text-brand-light underline" href="https://sweethomebathrooms.com" rel="noopener noreferrer">Sweethome</a>, our affiliated brand.</p>
        </div>
        <nav aria-label="Divisions" className="text-[0.95rem]">
          <p className="eyebrow !text-brand-light mb-4">Divisions</p>
          <ul className="space-y-0.5">
            {divisions.map((d) => <li key={d.id}><Link href={`/divisions/${d.slug}`} className={LINK}>{d.name}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label="Catalogue" className="text-[0.95rem]">
          <p className="eyebrow !text-brand-light mb-4">Catalogue</p>
          <ul className="space-y-0.5">
            {cats.slice(0, 6).map((k) => <li key={k.id}><Link href={`/catalogue/${k.slug}`} className={LINK}>{k.name}</Link></li>)}
            <li><Link href="/catalogue" className={LINK}>All categories</Link></li>
          </ul>
        </nav>
        <nav aria-label="Explore" className="text-[0.95rem]">
          <p className="eyebrow !text-brand-light mb-4">Explore</p>
          <ul className="space-y-0.5">
            {[['/chris-iyoha', 'Chris Iyoha'], ['/leadership', 'Leadership & Career'], ['/journal', 'Journal'], ['/media-centre', 'Media centre'], ['/opportunities', 'Opportunities'], ['/list', 'Project list'], ['/login', 'Track a request'], ['/about', 'About St. Chris'], ['/contact', 'Contact'], ['/admin/login', 'Staff sign-in']].map(([h, l]) => <li key={h}><Link href={h!} className={LINK}>{l}</Link></li>)}
          </ul>
        </nav>
        <address className="not-italic text-[0.95rem] text-paper/85 space-y-2">
          <p className="eyebrow !text-brand-light mb-4">{hasContact ? 'Reach us' : 'St. Chris Global Limited'}</p>
          <p>{c.legalName}</p>
          {c.address && <p>{c.address}</p>}
          {c.phone && <p className="mono"><a className="!text-paper/90 foot-link" href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}>{c.phone}</a></p>}
          {c.email && <p><a className="!text-paper/90 break-all foot-link" href={`mailto:${c.email}`}>{c.email}</a></p>}
          {wa && <p><a className="!text-paper/90 foot-link" href={`https://wa.me/${wa}`} rel="noopener noreferrer">Message us on WhatsApp</a></p>}
          {c.officeHours && <p className="text-paper/70">{c.officeHours}</p>}
          {!hasContact && <p><Link href="/contact" className="!text-paper/90 underline foot-link">Send us a message</Link></p>}
        </address>
      </div>
      <div className="border-t border-white/15">
        <div className="container-x py-5 flex flex-wrap gap-x-6 gap-y-2 justify-between text-sm text-paper/70">
          <p>© {new Date().getFullYear()} {c.legalName}{c.registrationNumber ? ` · ${c.registrationNumber}` : ''}</p>
          <p className="flex gap-5"><Link href="/privacy" className="!text-paper/80 foot-link no-underline hover:underline">Privacy notice</Link><Link href="/terms" className="!text-paper/80 foot-link no-underline hover:underline">Terms of use</Link>{cookieSettings && <CookieSettingsButton />}</p>
        </div>
      </div>
    </footer>
  );
}
