import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHero, NotBooking } from '@/components/blocks';
import { ListEditor } from '@/components/ListEditor';
import { getListView } from '@/server/project-list';
import { getSessionUser } from '@/server/session';

export const metadata: Metadata = { title: 'Project list', description: 'Your project list: the items and quantities you want quoted.', robots: { index: false } };

export default async function ListPage() {
  const [list, user] = await Promise.all([getListView(), getSessionUser()]);
  return (
    <>
      <PageHero compact eyebrow="Materials Desk" title="Your project list">
        <p>Everything you want quoted, in one place. It saves as you go, and it is not an order until you send it and accept our quotation.</p>
      </PageHero>
      <div className="container-x py-10 md:py-14 grid gap-10 lg:grid-cols-[1fr_19rem] items-start">
        <div className="min-w-0"><ListEditor initial={list.lines} /></div>
        <aside className="space-y-5 text-[0.95rem] lg:sticky lg:top-28">
          <div className="panel rule-top panel-pad">
            <h2 className="!text-lg">What happens next</h2>
            <ol className="mt-3 space-y-3 text-steel list-decimal ml-5">
              <li>Tell us about the project and where the materials are needed.</li>
              <li>The team reviews your list and may ask questions.</li>
              <li>You receive a written quotation and can accept it online.</li>
            </ol>
          </div>
          <NotBooking />
          {user?.role === 'CUSTOMER'
            ? <p className="text-sm text-steel">Your list is saved to your account and is there on any device you sign in on.</p>
            : <p className="text-sm text-steel">Your list is kept in this browser. <Link href="/register">Create an account</Link> or <Link href="/login?next=/list">sign in</Link> to keep it across devices and reorder later.</p>}
        </aside>
      </div>
    </>
  );
}
