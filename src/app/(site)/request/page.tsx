import type { Metadata } from 'next';
import { PageHero, NotBooking } from '@/components/blocks';
import { RequestBuilder, type BuilderService, type Prefill } from '@/components/RequestBuilder';
import { getRequestableServices } from '@/server/content';
import { getSessionUser } from '@/server/session';
import { getRepeatPrefill } from '@/server/requests';
import { getListView } from '@/server/project-list';
import { db } from '@/server/db';
import { getOpportunity } from '@/server/site-content';
import { enabledMessagingChannels } from '@/server/integrations';
import type { FieldDef } from '@/lib/validation';

export const metadata: Metadata = { title: 'Send for quotation', description: 'Tell St. Chris what you need. A guided form captures your project list and details and gives you a reference number.' };

export default async function RequestPage({ searchParams }: { searchParams: Promise<{ service?: string; repeat?: string; opportunity?: string }> }) {
  const sp = await searchParams;
  const [raw, user, channels, list] = await Promise.all([getRequestableServices(), getSessionUser(), enabledMessagingChannels(), getListView()]);
  const services: BuilderService[] = raw.map((s) => ({
    id: s.id, slug: s.slug, name: s.name, pillar: s.pillar, summary: s.summary, instructions: s.instructions, icon: s.icon, acceptsItems: s.acceptsItems,
    fields: s.fields.map((f): FieldDef => ({ key: f.key, label: f.label, type: f.type as FieldDef['type'], required: f.required, options: Array.isArray(f.options) ? (f.options as string[]) : null, unit: f.unit, helpText: f.helpText, placeholder: f.placeholder, section: f.section })),
  }));

  let prefill: Prefill | null = null;
  let initialSlug = sp.service ?? (list.count > 0 ? 'materials-quotation' : undefined);
  let initialDetails: Record<string, string | boolean> | undefined;
  let repeatOfId: string | undefined;
  const portal = user && user.role === 'CUSTOMER' ? user : null;
  if (portal) {
    const [contact, membership] = await Promise.all([
      db.contact.findFirst({ where: { userId: portal.id } }),
      db.companyMembership.findFirst({ where: { userId: portal.id }, include: { company: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    prefill = { name: portal.name, email: portal.email, phone: contact?.phone ?? '', companyName: membership?.company.name ?? '', jobTitle: contact?.jobTitle ?? '' };
    if (sp.repeat) {
      try {
        const r = await getRepeatPrefill(portal.id, sp.repeat);
        const svc = services.find((s) => s.id === r.serviceId);
        if (svc) {
          initialSlug = svc.slug;
          repeatOfId = r.id;
          initialDetails = Object.fromEntries(Object.entries((r.details ?? {}) as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'boolean' ? v : String(v)]));
        }
      } catch { /* not theirs or gone: start a blank request */ }
    }
  }

  // Responding to a posted opportunity: say so in the form, so the team sees what the message is about
  const opp = sp.opportunity ? await getOpportunity(sp.opportunity) : null;
  if (opp && !initialDetails) {
    const svc = services.find((s) => s.slug === initialSlug);
    const key = ['role_interest', 'proposal', 'message', 'requirement', 'notes'].find((k) => svc?.fields.some((f) => f.key === k));
    if (key) initialDetails = { [key]: `Responding to: ${opp.title}${opp.location ? ` (${opp.location})` : ''}. ` };
  }

  return (
    <>
      <PageHero compact eyebrow="St. Chris Materials Desk" title={repeatOfId ? 'Repeat a previous request' : 'Send for quotation'}>
        <p>A few short steps. You will get a reference number straight away.{opp ? ` You are responding to: ${opp.title}.` : ''}</p>
      </PageHero>
      <div className="container-x py-12 md:py-16 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="panel panel-pad !p-5 md:!p-8 min-w-0">
          {services.length === 0 ? <p>No request types are open at the moment. Please try again shortly.</p> : <RequestBuilder services={services} listLines={list.lines} prefill={prefill} initialSlug={initialSlug} initialDetails={initialDetails} repeatOfId={repeatOfId} signedIn={!!portal} channels={channels} />}
        </div>
        <aside className="space-y-5 text-[0.95rem]">
          <div className="panel rule-top panel-pad">
            <h2 className="!text-lg">What happens next</h2>
            <ol className="mt-3 space-y-3 text-steel list-decimal ml-5">
              <li>You receive a reference number and an email confirmation.</li>
              <li>The team reviews your request and may ask for more information.</li>
              <li>You receive a written quotation, which you can accept or decline online.</li>
            </ol>
          </div>
          <NotBooking />
          {!portal && <p className="text-sm text-steel">Want to track this request online? <a href="/register">Create an account</a> using the same email address and it will appear in your portal.</p>}
        </aside>
      </div>
    </>
  );
}
