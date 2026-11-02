import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCustomer } from '@/server/rbac';
import { getCustomerRequest, describeDetails } from '@/server/requests';
import { AppError } from '@/server/errors';
import { PageHeader, StatusBadge, QuotationBadge, Badge } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { Icon } from '@/components/Icon';
import { STATUS_CUSTOMER_TEXT, STATUS_LABELS } from '@/lib/workflow';
import { fmtDateTime, fmtBytes } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { signedFileUrl } from '@/server/storage';
import { isServable } from '@/server/scan';
import { ACCEPT_ATTR, ALLOWED_LABEL } from '@/lib/upload-rules';
import { answerInfoAction, reorderAction } from '../../actions';
import { RequestItemsTable } from '@/components/RequestItemsTable';

export const metadata = { title: 'Request' };

export default async function PortalRequest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const user = await requireCustomer();
  const { id } = await params;
  const { done } = await searchParams;
  let r;
  try { r = await getCustomerRequest(user.id, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  const rows = describeDetails(r);
  const open = r.infoRequests.filter((i) => i.status === 'OPEN');
  const timeline = [
    ...r.history.map((h) => ({ at: h.createdAt, text: h.toStatus === 'RECEIVED' ? 'Request received' : `Status: ${STATUS_LABELS[h.toStatus]}`, body: null as string | null, who: null as string | null })),
    ...r.communications.map((c) => ({ at: c.occurredAt, text: c.direction === 'INBOUND' ? 'You replied' : `Message from ${c.authorLabel}`, body: c.body, who: null })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/portal/requests">← My requests</Link></p>
      <PageHeader title={r.reference} eyebrow={r.service.name} actions={<Link className="btn btn-outline" href={`/request?repeat=${r.id}`}>Repeat this request</Link>}>
        <p className="flex flex-wrap gap-3 items-center"><StatusBadge status={r.status} /><span>{STATUS_CUSTOMER_TEXT[r.status]}</span></p>
      </PageHeader>

      {done === 'replied' && <div className="alert alert-ok mb-6" role="status">Thank you. Your reply has been sent to the St. Chris team.</div>}

      {open.map((i) => (
        <section key={i.id} className="panel rule-brand panel-pad mb-6" aria-label="We need information from you">
          <h2 className="!text-lg">We need a little more information</h2>
          <p className="mt-2 whitespace-pre-wrap">{i.question}</p>
          <ActionForm action={answerInfoAction} resetOnSuccess encType="multipart/form-data" className="mt-4 space-y-3">
            <input type="hidden" name="infoId" value={i.id} /><input type="hidden" name="requestId" value={r.id} />
            <Field name="answer" type="textarea" label="Your reply" required rows={4} /><Field name="files" type="file" label="Attach files (optional)" multiple accept={ACCEPT_ATTR} hint={ALLOWED_LABEL} />
            <SubmitButton pending="Sending…">Send reply</SubmitButton></ActionForm>
        </section>
      ))}

      {r.quotations.filter((q) => q.revisions.length > 0).map((q) => { const rev = q.revisions[0]!; return (
        <section key={q.id} className="panel rule-top panel-pad mb-6">
          <div className="flex flex-wrap justify-between gap-3 items-center"><h2 className="!text-lg">Quotation {q.number}</h2><QuotationBadge status={rev.status} /></div>
          <p className="mt-2 text-steel">Version {rev.version} · <span className="mono text-charcoal">{formatMoney(rev.total.toString(), rev.currency)}</span></p>
          <Link href={`/portal/quotations/${q.id}`} className="btn btn-primary mt-4">{['ISSUED', 'VIEWED'].includes(rev.status) ? 'Review and respond' : 'View quotation'}</Link>
        </section>); })}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6 min-w-0">
          {r.items.length > 0 && (
            <section className="panel panel-pad">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="!text-lg">Items you asked for</h2>
                <ActionForm action={reorderAction}><input type="hidden" name="id" value={r.id} /><SubmitButton className="btn btn-outline btn-sm">Add these to a new list</SubmitButton></ActionForm>
              </div>
              <RequestItemsTable items={r.items} />
            </section>
          )}
          <section className="panel panel-pad"><h2 className="!text-lg mb-4">Your requirement</h2>
            <dl className="kv">{rows.map((d) => <div key={d.key} className="contents"><dt>{d.label}</dt><dd>{d.value}</dd></div>)}<dt>Submitted</dt><dd>{fmtDateTime(r.submittedAt)}</dd></dl></section>
          <section className="panel panel-pad"><h2 className="!text-lg mb-4">Progress</h2>
            <ol className="space-y-4 border-l-2 border-line pl-5 ml-1">{timeline.map((t, i) => <li key={i} className="relative"><span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full bg-ember" aria-hidden="true" /><p><strong>{t.text}</strong> <span className="mono text-xs text-steel">{fmtDateTime(t.at)}</span></p>{t.body && <p className="mt-1 whitespace-pre-wrap text-[0.95rem]">{t.body}</p>}</li>)}</ol></section>
        </div>
        <section className="panel panel-pad self-start"><h2 className="!text-lg mb-3">Documents</h2>
          {r.documents.length === 0 ? <p className="text-sm text-steel">No documents.</p> : <ul className="divide-y divide-line">{r.documents.map((d) => <li key={d.id} className="py-2.5 text-sm">{isServable(d.scanStatus) ? <a href={signedFileUrl(d.id, user.id)} className="inline-flex items-center gap-2 font-medium"><Icon name="download" size={15} />{d.originalName}</a> : <span className="inline-flex items-center gap-2 font-medium text-steel"><Icon name="shield" size={15} />{d.originalName} (being checked)</span>}<span className="block text-steel">{fmtBytes(d.sizeBytes)} · {d.uploadedByLabel}</span></li>)}</ul>}
          {r.infoRequests.length > 0 && <p className="mt-4 text-sm"><Badge tone="info">{r.infoRequests.length} question{r.infoRequests.length > 1 ? 's' : ''} from St. Chris</Badge></p>}
        </section>
      </div>
    </>
  );
}
