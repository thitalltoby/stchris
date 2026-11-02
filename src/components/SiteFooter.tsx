import { GEEPEE } from '@/content/geepee';
import Link from 'next/link';
import { Logo } from './Logo';
import { getSetting } from '@/server/settings';
import { getCategories } from '@/server/catalogue';
import { CookieSettingsButton } from './ConsentAnalytics';
import { getDivisions } from '@/server/site-content';
import { SocialLinks } from './editorial';

const LINK = '!text-[#3b3e44] hover:!text-ember foot-link no-underline hover:underline';

export async function SiteFooter({ cookieSettings = false }: { cookieSettings?: boolean }) {
  const [c, cats, exec, divisions] = await Promise.all([getSetting('company'), getCategories(), getSetting('executive'), getDivisions()]);
  const waDigits = c.whatsapp.replace(/\D/g, '');
  const wa = /^[1-9]\d{9,14}$/.test(waDigits) ? waDigits : ''; // needs the country code; a local 0… number would give a broken chat link
  const hasContact = c.address || c.phone || c.email || wa || c.officeHours;
  return (
    <footer className="bg-white text-charcoal no-print border-t border-line">
      <div className="container-x pt-24 md:pt-36 pb-6">
        <p className="serif text-[clamp(1.5rem,3.2vw,2.6rem)] leading-[1.2] max-w-4xl">{exec.closing}</p>
        <SocialLinks links={exec} className="mt-10 text-charcoal" />
      </div>
      <div className="container-x py-16 md:py-24 grid gap-14 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.2fr]">
        <div>
          <Logo height={44} />
          <p className="mt-5 text-[#3b3e44] max-w-xs text-[0.95rem]">{c.tagline}</p>
          <Link href={GEEPEE.hub} className="mt-5 block max-w-xs border-l-4 border-brand pl-4 !text-charcoal no-underline hover:!text-ember"><span className="eyebrow !text-ember block">Strategic partner</span><span className="mt-1.5 block text-sm leading-snug text-[#3b3e44]"><strong className="text-charcoal">Major distributor &amp; strategic partner of GeePee Water Tanks</strong>, {GEEPEE.claim}.</span></Link>
        </div>
        <nav aria-label="Divisions" className="text-[0.95rem]">
          <p className="eyebrow !text-ember mb-5">Divisions</p>
          <ul className="space-y-0.5">
            {divisions.map((d) => <li key={d.id}><Link href={`/divisions/${d.slug}`} className={LINK}>{d.name}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label="Catalogue" className="text-[0.95rem]">
          <p className="eyebrow !text-ember mb-5">Catalogue</p>
          <ul className="space-y-0.5">
            {cats.slice(0, 6).map((k) => <li key={k.id}><Link href={`/catalogue/${k.slug}`} className={LINK}>{k.name}</Link></li>)}
            <li><Link href="/catalogue" className={LINK}>All categories</Link></li>
          </ul>
        </nav>
        <nav aria-label="Explore" className="text-[0.95rem]">
          <p className="eyebrow !text-ember mb-5">Explore</p>
          <ul className="space-y-0.5">
            {[['/chris-iyoha', 'Chris Iyoha'], ['/leadership', 'Leadership & Career'], ['/journal', 'Journal'], ['/media-centre', 'Media centre'], ['/opportunities', 'Opportunities'], ['/list', 'Project list'], ['/login', 'Track a request'], ['/about', 'About St. Chris'], ['/contact', 'Contact'], ['/admin/login', 'Staff sign-in']].map(([h, l]) => <li key={h}><Link href={h!} className={LINK}>{l}</Link></li>)}
          </ul>
        </nav>
        <address className="not-italic text-[0.95rem] text-[#3b3e44] space-y-2">
          <p className="eyebrow !text-ember mb-5">{hasContact ? 'Reach us' : 'St. Chris Global Limited'}</p>
          <p>{c.legalName}</p>
          {c.address && <p>{c.address}</p>}
          {c.phone && <p className="mono"><a className="!text-[#3b3e44] foot-link" href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}>{c.phone}</a></p>}
          {c.email && <p><a className="!text-[#3b3e44] break-all foot-link" href={`mailto:${c.email}`}>{c.email}</a></p>}
          {wa && <p><a className="!text-[#3b3e44] foot-link" href={`https://wa.me/${wa}`} rel="noopener noreferrer">Message us on WhatsApp</a></p>}
          {c.officeHours && <p className="text-steel">{c.officeHours}</p>}
          {!hasContact && <p><Link href="/contact" className="!text-[#3b3e44] underline foot-link">Send us a message</Link></p>}
        </address>
      </div>
      <div className="border-t border-line">
        <div className="container-x py-5 flex flex-wrap gap-x-6 gap-y-2 justify-between text-sm text-steel">
          <p>© {new Date().getFullYear()} {c.legalName}{c.registrationNumber ? ` · ${c.registrationNumber}` : ''}</p>
          <p className="flex gap-5"><Link href="/privacy" className="!text-[#3b3e44] foot-link no-underline hover:underline">Privacy notice</Link><Link href="/terms" className="!text-[#3b3e44] foot-link no-underline hover:underline">Terms of use</Link>{cookieSettings && <CookieSettingsButton />}</p>
        </div>
      </div>
    </footer>
  );
}
