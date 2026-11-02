import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { NotFoundView } from '@/components/NotFoundView';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Addresses that match no route at all (the site layout does not wrap these, so it is added here). */
export default function NotFound() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <SiteHeader />
      <main id="main"><NotFoundView /></main>
      <SiteFooter />
    </>
  );
}
