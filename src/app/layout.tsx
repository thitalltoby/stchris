import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import './globals.css';

import { getSetting } from '@/server/settings';
import '@fontsource-variable/montserrat/wght.css';
import '@fontsource-variable/plus-jakarta-sans/wght.css';

const BASE: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: { default: 'St. Chris Global Limited · Materials Desk', template: '%s · St. Chris Global' },
  description: "St. Chris Global Limited: building materials, bathroom and kitchen solutions and water storage, and a major distributor and strategic partner of GeePee Water Tanks, Africa's No. 1 Water Tank Manufacturer. Build a project list, get a written quotation.",
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

/** Type: Montserrat for headlines and numerals (closest bundled match to Gotham and Uni Sans), Plus Jakarta Sans for text and controls (closest to TT Firs Neue); both bundled via npm. Licensed brand fonts, if supplied, load from /fonts/faces.css and take priority. */

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render every page per request: the proxy's CSP nonce only reaches Next.js's scripts in a request-time render,
  // and pages that read the database cannot be prerendered when the build has no database (as on Render)
  await connection();
  return (
    <html lang="en">
      <head><link rel="stylesheet" href="/fonts/faces.css" /></head>
      <body>{children}</body>
    </html>
  );
}
