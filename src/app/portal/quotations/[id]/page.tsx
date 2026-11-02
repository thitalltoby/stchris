import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCustomer } from '@/server/rbac';
import { getCustomerQuotation, markViewed } from '@/server/quotations';
import { AppError } from '@/server/errors';
import { getSetting } from '@/server/settings';
import { PageHeader, QuotationBadge, Alert } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { formatMoney } from '@/lib/money';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { decideQuotationAction } from '../../actions';

export const metadata = { title: 'Quotation' };

export default async function PortalQuotation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const user = await requireCustomer();
  const { id } = await params;
  const { done } = await searchParams;
  let q;
  try { await markViewed(user.id, id); q = await getCustomerQuotation(user.id, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  const [s, company] = await Promise.all([getSetting('quotes'), getSetting('company')]);
  const rev = q.revisions[0]!;
  const live = ['ISSUED', 'VIEWED'].includes(rev.status);
  const expired = !!rev.validUntil && rev.validUntil < new Date();
  const m = (v: { toString(): string }) => formatMoney(v.toString(), rev.currency);
  return (
    <>
      <p className="mb-3 text-sm"><Link href={`/portal/requests/${q.request.id}`}>← Request {q.request.reference}</Link></p>
      <PageHeader title={`Quotation ${q.number}`} eyebrow={`Version ${rev.version}`} actions={<a className="btn btn-outline" href={`/quotation-pdf/${rev.id}`} target="_blank" rel="noopener">Download PDF</a>}>
        <p className="flex flex-wrap gap-3 items-center"><QuotationBadge status={rev.status} />{rev.validUntil && <span>Valid until {fmtDate(rev.validUntil)}</span>}</p>
      </PageHeader>
      {done === 'accepted' && <div className="mb-6"><Alert tone="ok">Thank you. Your acceptance has been recorded and the St. Chris team has been told.</Alert></div>}
      {done === 'declined' && <div className="mb-6"><Alert tone="ok">Your decision has been recorded. Thank you for letting us know.</Alert></div>}
      {rev.status === 'SUPERSEDED' && <div className="mb-6"><Alert tone="warn">This version was replaced by a newer one. Open the latest version from your request.</Alert></div>}
      {rev.status === 'WITHDRAWN' && <div className="mb-6"><Alert tone="warn">St. Chris has withdrawn this quotation. Please contact us if you have questions.</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="panel panel-pad min-w-0">
          <h2 className="!text-xl mb-3">{rev.title ?? 'Quotation'}</h2>
          {rev.introduction && <p className="whitespace-pre-wrap mb-5">{rev.introduction}</p>}
          <div className="table-wrap"><table className="dt"><caption className="sr-only">Line items</caption><thead><tr><th>Description</th><th className="num">Qty</th><th>Unit</th><th className="num">Unit price</th><th className="num">Net</th></tr></thead>
            <tbody>{rev.lineItems.map((l) => <tr key={l.id}><td>{l.description}{Number(l.discountPercent) > 0 && <span className="block text-xs text-steel">Discount {l.discountPercent.toString()}%</span>}</td><td className="num">{l.quantity.toString()}</td><td>{l.unit}</td><td className="num">{m(l.unitPrice)}</td><td className="num">{m(l.lineNet)}</td></tr>)}</tbody></table></div>
          <dl className="ml-auto max-w-xs mt-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 mono text-sm"><dt>Subtotal</dt><dd className="text-right">{m(rev.subtotal)}</dd>{Number(rev.discountTotal) > 0 && <><dt>Discounts</dt><dd className="text-right">−{m(rev.discountTotal)}</dd></>}<dt>Tax</dt><dd className="text-right">{m(rev.taxTotal)}</dd><dt className="font-bold text-base border-t-2 border-charcoal pt-1">Total</dt><dd className="font-bold text-base text-right border-t-2 border-charcoal pt-1">{m(rev.total)}</dd></dl>
          {rev.paymentTerms && <div className="mt-6"><p className="eyebrow">Payment terms</p><p className="whitespace-pre-wrap">{rev.paymentTerms}</p></div>}
          {rev.terms && <div className="mt-5"><p className="eyebrow">Terms and conditions</p><p className="whitespace-pre-wrap text-sm">{rev.terms}</p></div>}
        </section>
        <aside className="space-y-6 self-start">
          {live && !expired && s.customerCanRespond && (
            <section className="panel rule-top panel-pad"><h2 className="!text-lg mb-2">Your decision</h2>
              <p className="text-sm text-steel mb-4">Accepting records your agreement to this quotation. St. Chris will then contact you about next steps.</p>
              <ActionForm action={decideQuotationAction} className="space-y-4"><input type="hidden" name="quotationId" value={q.id} />
                <Field name="comment" type="textarea" rows={3} label="Comment (required if you decline)" />
                <Field name="authorised" type="checkbox" label="I am authorised to accept this quotation on behalf of my company." />
                <div className="flex flex-wrap gap-3"><SubmitButton name="decision" value="ACCEPTED" className="btn btn-primary">Accept quotation</SubmitButton><SubmitButton name="decision" value="DECLINED" className="btn btn-danger">Decline</SubmitButton></div></ActionForm></section>
          )}
          {live && !expired && !s.customerCanRespond && <Alert tone="info">To accept or decline, please contact St. Chris on {company.phone}, quoting {q.number}.</Alert>}
          {live && expired && <Alert tone="warn">This quotation has passed its validity date. Please contact us for an updated one.</Alert>}
          {rev.decisions.length > 0 && <section className="panel panel-pad"><h2 className="!text-lg mb-2">Your response</h2>{rev.decisions.map((d) => <p key={d.id} className="text-sm"><strong>{d.decision === 'ACCEPTED' ? 'Accepted' : 'Declined'}</strong> by {d.decidedByName} on {fmtDateTime(d.createdAt)}{d.comment && <span className="block text-steel mt-1">“{d.comment}”</span>}</p>)}</section>}
        </aside>
      </div>
    </>
  );
}
