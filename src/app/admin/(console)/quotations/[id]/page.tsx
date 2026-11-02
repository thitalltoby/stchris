import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/server/rbac';
import { getQuotationForStaff } from '@/server/quotations';
import { AppError } from '@/server/errors';
import { getSetting } from '@/server/settings';
import { PageHeader, QuotationBadge, Badge } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { QuoteEditor } from '@/components/QuoteEditor';
import { can } from '@/lib/permissions';
import { formatMoney } from '@/lib/money';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { saveRevisionAction, decideAction, issueAction, reviseAction, withdrawAction, recordOfflineAction } from '../actions';
import { OFFLINE_CHANNELS } from '@/server/quotations';
import { db } from '@/server/db';

export const metadata = { title: 'Quotation' };

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff('quotation.view');
  const { id } = await params;
  let q;
  try { q = await getQuotationForStaff(user, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  const s = await getSetting('quotes');
  const latest = q.revisions[0]!;
  const full = await db.user.findUnique({ where: { id: user.id }, select: { approvalLimit: true } });
  const draft = latest.status === 'DRAFT';
  const submitter = latest.approvals.find((a) => a.decision === 'SUBMITTED');
  const isSelfApproval = latest.createdById === user.id || submitter?.actorId === user.id;
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/admin/quotations">← All quotations</Link></p>
      <PageHeader title={q.number} eyebrow={`Request ${q.request.reference}`}
        actions={<a className="btn btn-outline" href={`/quotation-pdf/${latest.id}`} target="_blank" rel="noopener">{draft ? 'Preview PDF (draft)' : 'Download PDF'}</a>}>
        <p className="flex flex-wrap items-center gap-3"><QuotationBadge status={latest.status} /><span>Version {latest.version} · {formatMoney(latest.total.toString(), latest.currency)}</span><Link href={`/admin/requests/${q.request.id}`}>Open request</Link></p>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 space-y-6">
          {draft && can(user.role, 'quotation.create') ? (
            <section className="panel panel-pad">
              <h2 className="!text-lg mb-4">Edit draft</h2>
              <QuoteEditor quotationId={q.id} revisionId={latest.id} currency={latest.currency} taxRates={s.taxRates} defaultTax={s.defaultTaxPercent} canSubmit={can(user.role, 'quotation.submit')} saveAction={saveRevisionAction}
                initial={{ title: latest.title ?? '', introduction: latest.introduction ?? '', terms: latest.terms ?? '', paymentTerms: latest.paymentTerms ?? '', validityDays: latest.validityDays,
                  lines: latest.lineItems.map((l) => ({ description: l.description, unit: l.unit, quantity: l.quantity.toString(), unitPrice: l.unitPrice.toString(), discountPercent: l.discountPercent.toString(), taxPercent: l.taxPercent.toString(), productId: l.productId, variantId: l.variantId, sku: l.sku })) }} />
            </section>
          ) : (
            <RevisionView rev={latest} />
          )}
          {q.revisions.slice(1).length > 0 && (
            <section className="panel panel-pad"><h2 className="!text-lg mb-3">Earlier revisions</h2>
              {q.revisions.slice(1).map((r) => (<details key={r.id} className="border-t border-line py-3"><summary className="cursor-pointer flex flex-wrap gap-3 items-center">Version {r.version} <QuotationBadge status={r.status} /><span className="mono text-sm">{formatMoney(r.total.toString(), r.currency)}</span></summary><div className="mt-3"><RevisionView rev={r} compact /></div></details>))}
            </section>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <section className="panel rule-top panel-pad">
            <h2 className="!text-lg mb-3">Next step</h2>
            {latest.status === 'DRAFT' && <p className="text-sm text-steel">Complete the draft, then submit it for approval{s.requireApproval ? '' : ' (approval is currently switched off in Settings)'}.</p>}
            {latest.status === 'PENDING_APPROVAL' && (can(user.role, 'quotation.approve') ? (
              isSelfApproval ? <div className="alert alert-warn">You prepared or submitted this version, so another approver must review it.</div> : (
                <ActionForm action={decideAction} className="space-y-3">
                  <input type="hidden" name="quotationId" value={q.id} /><input type="hidden" name="revisionId" value={latest.id} />
                  <Field name="comment" type="textarea" label="Comment" rows={3} hint="Required if you reject." />
                  {full?.approvalLimit && <p className="hint">Your approval limit: {formatMoney(full.approvalLimit.toString(), latest.currency)}</p>}
                  <div className="flex gap-3"><SubmitButton name="decision" value="APPROVED" className="btn btn-primary">Approve</SubmitButton><SubmitButton name="decision" value="REJECTED" className="btn btn-danger">Reject</SubmitButton></div>
                </ActionForm>)
            ) : <p className="text-sm text-steel">Waiting for an approver.</p>)}
            {latest.status === 'APPROVED' && (can(user.role, 'quotation.issue') ? (
              <ActionForm action={issueAction} className="space-y-3"><input type="hidden" name="quotationId" value={q.id} /><input type="hidden" name="revisionId" value={latest.id} />
                <p className="text-sm text-steel">Issuing emails the customer and sets the request to “Quotation issued”. The quotation will be valid for {latest.validityDays} days.</p>
                <SubmitButton className="btn btn-primary">Issue to customer</SubmitButton></ActionForm>
            ) : <p className="text-sm text-steel">Approved. Waiting for commercial staff to issue it.</p>)}
            {['ISSUED', 'VIEWED'].includes(latest.status) && <p className="text-sm text-steel">Issued {fmtDate(latest.issuedAt)}, valid until {fmtDate(latest.validUntil)}. {latest.status === 'VIEWED' ? `First viewed ${fmtDateTime(latest.firstViewedAt)}.` : 'Not yet opened by the customer.'}</p>}
            {latest.status === 'ACCEPTED' && <p className="text-sm">Accepted{latest.decisions[0] && latest.decisions[0].channel !== 'ONLINE' ? ' (recorded by staff)' : ' by the customer'}. It is now binding and cannot be revised.</p>}
            {['DECLINED', 'EXPIRED', 'WITHDRAWN'].includes(latest.status) && <p className="text-sm text-steel">This version is closed.</p>}

            {can(user.role, 'quotation.create') && ['ISSUED', 'VIEWED', 'APPROVED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'].includes(latest.status) && (
              <ActionForm action={reviseAction} className="mt-4 pt-4 border-t border-line"><input type="hidden" name="quotationId" value={q.id} /><SubmitButton className="btn btn-outline btn-sm">Create new revision</SubmitButton><p className="hint mt-2">The current version is kept as history.</p></ActionForm>
            )}
            {can(user.role, 'quotation.issue') && ['APPROVED', 'ISSUED', 'VIEWED'].includes(latest.status) && (
              <ActionForm action={withdrawAction} className="mt-4 pt-4 border-t border-line space-y-3"><input type="hidden" name="quotationId" value={q.id} /><Field name="reason" label="Withdraw this quotation" required placeholder="Reason" /><SubmitButton className="btn btn-danger btn-sm">Withdraw</SubmitButton></ActionForm>
            )}
          </section>

          {can(user.role, 'quotation.recordResponse') && ['ISSUED', 'VIEWED'].includes(latest.status) && (
            <section className="panel panel-pad">
              <h2 className="!text-lg mb-1">Record an offline answer</h2>
              <p className="text-sm text-steel mb-4">Use this when the customer accepts or declines by phone, on paper, by email or in person. It is stored as an answer recorded by you, with the date the customer actually gave it.</p>
              <ActionForm action={recordOfflineAction} resetOnSuccess className="space-y-3" encType="multipart/form-data">
                <input type="hidden" name="quotationId" value={q.id} />
                <Field name="decision" type="select" label="Customer’s answer" required defaultValue="ACCEPTED" options={[{ value: 'ACCEPTED', label: 'Accepted' }, { value: 'DECLINED', label: 'Declined' }]} />
                <Field name="channel" type="select" label="How they answered" required defaultValue="PHONE" options={Object.entries(OFFLINE_CHANNELS).map(([value, label]) => ({ value, label }))} />
                <Field name="respondentName" label="Who answered" required placeholder="Name of the customer’s representative" />
                <Field name="respondentEmail" type="email" label="Their email (optional)" hint="If given, they receive a confirmation that the answer was recorded." />
                <Field name="occurredAt" type="datetime-local" label="When they answered" required />
                <Field name="reference" label="Customer’s reference" placeholder="Purchase order or signed-form number" hint="Needed for an acceptance unless you attach evidence." />
                <Field name="note" type="textarea" rows={3} label="What was said or agreed" required hint="This becomes part of the permanent record." />
                <Field name="evidence" type="file" label="Evidence (optional)" accept=".pdf,.png,.jpg,.jpeg,.docx,.txt" hint="A signed copy, a screenshot of the message, or call notes." />
                <SubmitButton pending="Recording…">Record answer</SubmitButton>
              </ActionForm>
            </section>
          )}

          <section className="panel panel-pad">
            <h2 className="!text-lg mb-3">Approval history</h2>
            {latest.approvals.length === 0 ? <p className="text-sm text-steel">None yet.</p> : <ul className="space-y-3 text-sm">{latest.approvals.map((a) => <li key={a.id}><strong>{a.decision.charAt(0) + a.decision.slice(1).toLowerCase()}</strong> by {a.actorLabel} <span className="text-steel mono text-xs">{fmtDateTime(a.createdAt)}</span>{a.comment && <span className="block text-steel">{a.comment}</span>}</li>)}</ul>}
          </section>
          {latest.decisions.length > 0 && (
            <section className="panel panel-pad"><h2 className="!text-lg mb-3">Customer response</h2>
              {latest.decisions.map((d) => <p key={d.id} className="text-sm"><Badge tone={d.decision === 'ACCEPTED' ? 'good' : 'bad'}>{d.decision}</Badge> {d.decidedByName}{d.decidedByEmail ? ` (${d.decidedByEmail})` : ''} · <span className="mono text-xs">{fmtDateTime(d.occurredAt ?? d.createdAt)}</span>
                {d.channel !== 'ONLINE' && <span className="block mt-1 text-steel">Recorded by {d.recordedByName} ({fmtDateTime(d.createdAt)}) · {OFFLINE_CHANNELS[d.channel as keyof typeof OFFLINE_CHANNELS] ?? d.channel}{d.reference ? ` · Ref ${d.reference}` : ''}{d.evidenceDocumentId ? ' · Evidence attached to the request' : ''}</span>}
                {d.comment && <span className="block mt-1 text-steel">“{d.comment}”</span>}</p>)}
            </section>
          )}
          <p className="text-sm text-steel">Prepared by {q.createdBy?.name ?? '—'} on {fmtDate(q.createdAt)}.</p>
        </div>
      </div>
    </>
  );
}

type Rev = Awaited<ReturnType<typeof getQuotationForStaff>>['revisions'][number];
function RevisionView({ rev, compact }: { rev: Rev; compact?: boolean }) {
  return (
    <section className={compact ? '' : 'panel panel-pad'}>
      {!compact && <h2 className="!text-lg mb-4">{rev.title ?? 'Quotation'} <span className="text-steel mono text-sm">v{rev.version}</span></h2>}
      {rev.introduction && <p className="mb-4 whitespace-pre-wrap">{rev.introduction}</p>}
      <div className="table-wrap"><table className="dt"><thead><tr><th>Description</th><th className="num">Qty</th><th>Unit</th><th className="num">Unit price</th><th className="num">Disc.%</th><th className="num">Tax%</th><th className="num">Net</th></tr></thead>
        <tbody>{rev.lineItems.map((l) => <tr key={l.id}><td>{l.description}</td><td className="num">{l.quantity.toString()}</td><td>{l.unit}</td><td className="num">{formatMoney(l.unitPrice.toString(), rev.currency)}</td><td className="num">{l.discountPercent.toString()}</td><td className="num">{l.taxPercent.toString()}</td><td className="num">{formatMoney(l.lineNet.toString(), rev.currency)}</td></tr>)}</tbody></table></div>
      <dl className="ml-auto max-w-xs mt-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 mono text-sm">
        <dt>Subtotal</dt><dd className="text-right">{formatMoney(rev.subtotal.toString(), rev.currency)}</dd><dt>Discounts</dt><dd className="text-right">−{formatMoney(rev.discountTotal.toString(), rev.currency)}</dd><dt>Tax</dt><dd className="text-right">{formatMoney(rev.taxTotal.toString(), rev.currency)}</dd>
        <dt className="font-bold border-t-2 border-charcoal pt-1">Total</dt><dd className="font-bold text-right border-t-2 border-charcoal pt-1">{formatMoney(rev.total.toString(), rev.currency)}</dd></dl>
      {rev.paymentTerms && <div className="mt-5"><p className="eyebrow">Payment terms</p><p className="whitespace-pre-wrap">{rev.paymentTerms}</p></div>}
      {rev.terms && <div className="mt-4"><p className="eyebrow">Terms and conditions</p><p className="whitespace-pre-wrap text-sm">{rev.terms}</p></div>}
    </section>
  );
}
