import Link from 'next/link';
import { PageHero, Section } from './blocks';

/** Shown for any address that does not exist. Points people back to the three things they can do here. */
export function NotFoundView() {
  return (
    <>
      <PageHero eyebrow="Page not found" title="We could not find that page.">
        <p>The address may have changed, or the product may no longer be listed. Search the catalogue, or send us what you need and we will find it.</p>
      </PageHero>
      <Section>
        <div className="flex flex-wrap gap-3">
          <Link href="/catalogue" className="btn btn-primary">Browse the catalogue</Link>
          <Link href="/search" className="btn btn-outline">Search</Link>
          <Link href="/request" className="btn btn-outline">Send a list for quotation</Link>
        </div>
      </Section>
    </>
  );
}
