import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHero } from '@/components/blocks';
import { Icon } from '@/components/Icon';
import { db } from '@/server/db';
import { verifyConfirmationToken, describeDetails } from '@/server/requests';
import { fmtDateTime } from '@/lib/format';
import { getSetting } from '@/server/settings';
import { getSessionUser } from '@/server/session';
import { TrackLead } from '@/components/TrackLead';
import { WhatsAppButton } from '@/components/WhatsAppButton';

export const metadata: Metadata = { title: 'Request received', robots: { index: false } };

export default async function ConfirmationPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ reference }, { t }] = await Promise.all([params, searchParams]);
  // The token is an HMAC of the reference: possession proves this person submitted it. References alone reveal nothing.
  if (!t || !verifyConfirmationToken(reference, t)) notFound();
  const [req, c, user] = await Promise.all([
    db.quoteRequest.findUnique({ where: { reference }, include: { service: { select: { name: true, slug: true } }, items: { orderBy: { sortOrder: 'asc' } }, documents: { where: { visibility: 'CUSTOMER' }, select: { id: true, originalName: true } } } }),
    getSetting('company'),
    getSessionUser(),
  ]);
  if (!req) notFound();
  const rows = describeDetails(req);
  return (
    <>
      <TrackLead type={req.service.slug} id={req.id} />
      <PageHero compact eyebrow="Request received" title="Thank you. Your request has been recorded.">
        <p>Keep this reference number. Quote it whenever you contact us about this request.</p>
      </PageHero>
      <div className="container-x py-12 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <div className="panel rule-top panel-pad">
            <p className="eyebrow">Reference</p>
            <p className="mono text-3xl md:text-4xl font-medium text-ember mt-1 break-all" data-testid="reference">{req.reference}</p>
            <p className="mt-2 text-steel text-sm">Submitted {fmtDateTime(req.submittedAt)}</p>
          </div>
          <div className="alert alert-warn"><strong>This is not an order or a quotation.</strong> Your request is recorded and will be reviewed by the St. Chris team. Nothing is confirmed until you receive and accept a written quotation.</div>
          {req.items.length > 0 && (
            <div className="panel panel-pad">
              <h2 className="!text-xl mb-4">Your list ({req.items.length} {req.items.length === 1 ? 'line' : 'lines'})</h2>
              <ul className="divide-y divide-line">
                {req.items.map((i) => <li key={i.id} className="py-2.5 flex justify-between gap-4"><span className="min-w-0">{i.label}{i.note ? <span className="block text-sm text-steel">{i.note}</span> : null}</span><span className="mono flex-none">{Number(i.quantity).toLocaleString('en-GB')} {i.unit}</span></li>)}
              </ul>
            </div>
          )}
          <div className="panel panel-pad">
            <h2 className="!text-xl mb-4">Your request</h2>
            <dl className="kv">
              <dt>Request type</dt><dd>{req.service.name}</dd>
              {rows.map((r) => <div key={r.key} className="contents"><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
              <dt>Contact</dt><dd>{req.requesterName} · {req.requesterEmail}</dd>
              {req.documents.length > 0 && <><dt>Documents</dt><dd>{req.documents.map((d) => d.originalName).join(', ')}</dd></>}
            </dl>
          </div>
        </div>
        <aside className="space-y-6">
          <div className="panel panel-pad">
            <h2 className="!text-xl">What happens next</h2>
            <ol className="mt-4 space-y-4">
              {['We email you a confirmation.', 'The team reviews your requirement and may ask for more information.', 'Where we can supply it, we send a written quotation that you can accept online.'].map((t, i) => (
                <li key={t} className="flex gap-3"><span className="mono text-ember font-medium">0{i + 1}</span><span>{t}</span></li>
              ))}
            </ol>
          </div>
          {user?.role === 'CUSTOMER' ? (
            <Link href={`/portal/requests/${req.id}`} className="btn btn-primary w-full">View in your portal</Link>
          ) : (
            <div className="panel panel-pad">
              <h2 className="!text-lg">Track it online</h2>
              <p className="text-steel text-sm mt-2">Create an account with <strong>{req.requesterEmail}</strong> to follow this request, reply to questions and respond to quotations.</p>
              <Link href={`/register?email=${encodeURIComponent(req.requesterEmail)}`} className="btn btn-primary w-full mt-4">Create an account</Link>
            </div>
          )}
          {c.phone && <p className="text-sm text-steel flex gap-2"><Icon name="phone" size={16} /> Urgent? {c.phone}</p>}
        </aside>
      </div>
    </>
  );
}
