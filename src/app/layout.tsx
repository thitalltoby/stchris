import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import fs from 'node:fs';
import path from 'node:path';
import '@fontsource-variable/figtree/wght.css';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './globals.css';

import { getSetting } from '@/server/settings';

const BASE: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: { default: 'St. Chris Global Limited · Materials Desk', template: '%s · St. Chris Global' },
  description: 'Building materials, bathroom and kitchen solutions, plumbing and water storage for contractors, developers, retailers and homeowners in Nigeria. Build a project list, get a written quotation.',
  applicationName: 'St. Chris Materials Desk',
  openGraph: { siteName: 'St. Chris Global Limited', type: 'website', locale: 'en_NG' },
};


/** Adds the Search Console ownership tag when staff have entered one (Console → SEO). The site renders fine without it. */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const seo = await getSetting('seo');
    return seo.searchConsoleToken ? { ...BASE, verification: { google: seo.searchConsoleToken } } : BASE;
  } catch {
    return BASE;
  }
}

export const viewport: Viewport = { themeColor: '#1c1917', width: 'device-width', initialScale: 1 };

/**
 * TT Firs Neue is a licensed typeface (TypeType) and is not bundled. When the licensed web-font files are
 * placed in /public/fonts (see public/fonts/README.txt) they are picked up here automatically; until then
 * headings fall back to Figtree, which has similar proportions.
 */
const TT_FIRS_NEUE: Array<[string, number]> = [['Regular', 400], ['Medium', 500], ['DemiBold', 600], ['Bold', 700], ['ExtraBold', 800]];
function ttFirsNeueCss(): string {
  const dir = path.join(process.cwd(), 'public', 'fonts');
  return TT_FIRS_NEUE.filter(([n]) => fs.existsSync(path.join(dir, `TTFirsNeue-${n}.woff2`)))
    .map(([n, w]) => `@font-face{font-family:'TT Firs Neue';font-weight:${w};font-style:normal;font-display:swap;src:url('/fonts/TTFirsNeue-${n}.woff2') format('woff2')}`)
    .join('');
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const fontCss = ttFirsNeueCss();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en">
      {fontCss ? <head><style nonce={nonce} dangerouslySetInnerHTML={{ __html: fontCss }} /></head> : null}
      <body>{children}</body>
    </html>
  );
}
