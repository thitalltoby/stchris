import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHero, Section } from '@/components/blocks';
import { Icon } from '@/components/Icon';
import { getSetting } from '@/server/settings';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { getFaqs } from '@/server/content';

export const metadata: Metadata = { title: 'Contact', description: 'Contact St. Chris Global Limited, or send a request through the Materials Desk.' };

export default async function ContactPage() {
  const [c, faqs] = await Promise.all([getSetting('company'), getFaqs()]);
  const items = [
    { icon: 'pin', label: 'Registered office', value: c.address, href: c.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}` : undefined, external: true },
    { icon: 'phone', label: 'Telephone', value: c.phone, href: c.phone ? `tel:${c.phone.replace(/[^+\d]/g, '')}` : undefined, external: false },
    { icon: 'mail', label: 'Email', value: c.email, href: c.email ? `mailto:${c.email}` : undefined, external: false },
    ...(c.officeHours ? [{ icon: 'clock', label: 'Office hours', value: c.officeHours, href: undefined, external: false }] : []),
    ...(c.registrationNumber ? [{ icon: 'check', label: 'Company registration', value: c.registrationNumber, href: undefined, external: false }] : []),
  ].filter((i) => i.value);
  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to the St. Chris team" />
      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
          <div>
            <h2 className="!text-2xl mb-6">{c.legalName}</h2>
            {items.length === 0 && <p className="text-steel max-w-md">Our address and direct telephone and email details will appear here once they are confirmed. Until then, every enquiry goes through the Materials Desk: you get a reference number, we reply by email, and nothing gets lost.</p>}
            <ul className="space-y-5">
              {items.map((i) => (
                <li key={i.label} className="flex gap-4"><span className="text-ember mt-1"><Icon name={i.icon} size={22} /></span>
                  <div><p className="eyebrow">{i.label}</p><p className="mt-1 text-lg">{i.href ? <a href={i.href} {...(i.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{i.value}{i.external && <span className="sr-only"> (opens a map in a new tab)</span>}</a> : i.value}</p></div></li>
              ))}
            </ul>
          </div>
          <div className="panel rule-top panel-pad self-start">
            <h2 className="!text-2xl">Have a requirement?</h2>
            <p className="mt-3 text-steel">For anything you want quoted, the project list is the fastest route: it captures what the team needs and gives you a reference number straight away.</p>
            <div className="mt-5 flex flex-wrap gap-3"><Link href="/list" className="btn btn-primary">Open my project list</Link><WhatsAppButton number={c.whatsapp} message="Hello St. Chris, I would like to make an enquiry." where="contact" /></div>
            <p className="mt-5 text-sm text-steel">Already have an account? <Link href="/login">Sign in</Link> to follow up on an existing request.</p>
          </div>
        </div>
      </Section>
      <Section tone="tint" eyebrow="Who to contact" title="Choose the route that fits" intro="Each route gets your message to the right person faster, and gives you a reference number you can follow online.">
        <ul className="grid gap-x-12 md:grid-cols-2 border-t border-line">
          {[
            { href: '/list', t: 'You want materials quoted', d: 'Build a project list and send it for a written quotation.' },
            { href: '/services/source-a-product', t: 'You cannot find an item', d: 'Describe it and we will tell you what we can source.' },
            { href: '/login', t: 'You already have a request or quotation', d: 'Sign in to follow it, answer questions and respond to a quotation.' },
            { href: '/services/trade-account', t: 'You buy regularly', d: 'Open a trade account for saved lists, online acceptance and reorders.' },
            { href: '/services/dealer-partnership', t: 'You run a shop or distribute', d: 'Tell us about your outlet and the categories you want to carry.' },
            { href: '/services/supplier-introduction', t: 'You make or supply products', d: 'Introduce your range for the Nigerian market.' },
          ].map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="group row-link !border-t-0 grid-cols-[1fr_auto] items-center">
                <span><span className="block font-display font-semibold text-[1.1rem]">{r.t}</span><span className="block mt-1 text-steel text-[0.95rem] max-w-md">{r.d}</span></span>
                <span className="row-arrow" aria-hidden="true"><Icon name="arrow" size={20} /></span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-steel max-w-2xl">For anything else, <Link href="/services/ask-a-question">ask us a question</Link>. We will reply by email.</p>
      </Section>
      {faqs.length > 0 && (
        <Section tone="tint" eyebrow="FAQ" title="Common questions">
          <div className="max-w-3xl divide-y divide-line border-y border-line">
            {faqs.map((f) => (
              <details key={f.id} className="group py-4">
                <summary className="cursor-pointer list-none flex justify-between gap-4 font-display font-bold text-lg">{f.question}<span className="text-ember group-open:rotate-45 transition-transform"><Icon name="plus" /></span></summary>
                <p className="mt-3 text-steel max-w-2xl">{f.answer}</p>
              </details>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
