import Link from 'next/link';
import { RequestItemsTable } from '@/components/RequestItemsTable';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/server/rbac';
import { getRequestForStaff, describeDetails } from '@/server/requests';
import { AppError } from '@/server/errors';
import { PageHeader, StatusBadge, QuotationBadge, Badge } from '@/components/ui';
import { ActionForm, Field, SubmitButton, ActionButton } from '@/components/ActionForm';
import { Icon } from '@/components/Icon';
import { can } from '@/lib/permissions';
import { TRANSITIONS, QUOTATION_DRIVEN, STATUS_LABELS, REASON_REQUIRED } from '@/lib/workflow';
import { fmtDate, fmtDateTime, fmtBytes, fmtRelativeDays, defaultDueDate } from '@/lib/format';
import { signedFileUrl } from '@/server/storage';
import { isServable, SCAN_LABELS } from '@/server/scan';
import { listStaff } from '@/server/customers';
import { ACCEPT_ATTR, ALLOWED_LABEL } from '@/lib/upload-rules';
import { formatMoney } from '@/lib/money';
import { changeStatusAction, assignAction, addCommAction, requestInfoAction, createTaskAction, completeTaskAction, uploadDocAction, createQuotationAction } from '../actions';

export const metadata = { title: 'Request' };

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  let r;
  try { r = await getRequestForStaff(user, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  const staff = await listStaff();
  const details = describeDetails(r);
  const bySection = new Map<string, typeof details>();
  for (const d of details) bySection.set(d.section, [...(bySection.get(d.section) ?? []), d]);

  const nextStatuses = TRANSITIONS[r.status].filter((s) => !QUOTATION_DRIVEN.includes(s) && (!REASON_REQUIRED.includes(s) || can(user.role, 'request.close')));
  const timeline = [
    ...r.history.map((h) => ({ at: h.createdAt, kind: 'status' as const, who: h.actorLabel, text: `${h.fromStatus ? `${STATUS_LABELS[h.fromStatus]} → ` : 'Submitted as '}${STATUS_LABELS[h.toStatus]}`, note: h.note })),
    ...r.communications.map((c) => ({ at: c.occurredAt, kind: 'comm' as const, who: c.authorLabel, text: `${c.type.charAt(0) + c.type.slice(1).toLowerCase()}${c.direction === 'INBOUND' ? ' from customer' : c.direction === 'INTERNAL' ? ' (internal)' : c.customerVisible ? ' to customer' : ''}${c.subject ? `: ${c.subject}` : ''}`, note: c.body })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const canNote = can(user.role, 'request.note');
  const openTasks = r.tasks.filter((t) => t.status === 'OPEN');

  return (
    <>
      <p className="mb-3 text-sm"><Link href="/admin/requests">← All requests</Link></p>
      <PageHeader title={r.reference} eyebrow={r.service.name}
        actions={can(user.role, 'quotation.create') && !['COMPLETED', 'DECLINED', 'CANCELLED', 'CLOSED', 'EXPIRED'].includes(r.status) ? (
          <ActionForm action={createQuotationAction}><input type="hidden" name="id" value={r.id} /><SubmitButton className="btn btn-primary">New quotation</SubmitButton></ActionForm>
        ) : undefined}>
        <p className="flex flex-wrap items-center gap-3"><StatusBadge status={r.status} /><span className="text-sm">{r.summary}</span></p>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6 min-w-0">
          {r.items.length > 0 && (
            <section className="panel panel-pad">
              <h2 className="!text-lg mb-4">Items requested <span className="text-steel font-normal">({r.items.length})</span></h2>
              <RequestItemsTable items={r.items} showSku />
              <p className="hint mt-3">A new quotation starts with these lines, priced from the price book where one is set.</p>
            </section>
          )}
          <section className="panel panel-pad">
            <h2 className="!text-lg mb-4">Requirement</h2>
            {[...bySection.entries()].map(([sec, rows]) => (
              <div key={sec} className="mb-4 last:mb-0"><p className="eyebrow mb-2">{sec}</p><dl className="kv">{rows.map((d) => <div key={d.key} className="contents"><dt>{d.label}</dt><dd>{d.value}</dd></div>)}</dl></div>
            ))}
            <dl className="kv border-t border-line pt-4 mt-2">
              <dt>Frequency</dt><dd>{r.recurrence === 'RECURRING' ? 'Recurring' : 'One-off'}</dd>
              <dt>Submitted</dt><dd>{fmtDateTime(r.submittedAt)} via {r.source ?? 'website'}</dd>
              {r.neededFrom && <><dt>Needed from</dt><dd>{fmtDate(r.neededFrom)}</dd></>}
              {r.neededBy && <><dt>Needed by</dt><dd>{fmtDate(r.neededBy)}</dd></>}
            </dl>
          </section>

          <section className="panel panel-pad">
            <h2 className="!text-lg mb-4">Timeline</h2>
            <ol className="space-y-4 border-l-2 border-line pl-5 ml-1">
              {timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ${t.kind === 'status' ? 'bg-ember' : 'bg-steel'}`} aria-hidden="true" />
                  <p className="text-sm"><strong>{t.text}</strong> <span className="text-steel">· {t.who} · <span className="mono text-xs">{fmtDateTime(t.at)}</span></span></p>
                  {t.note && <p className="mt-1 text-[0.95rem] whitespace-pre-wrap text-charcoal/90">{t.note}</p>}
                </li>
              ))}
            </ol>
          </section>

          {canNote && (
            <section className="panel panel-pad">
              <h2 className="!text-lg mb-4">Add a note or log contact</h2>
              <ActionForm action={addCommAction} resetOnSuccess className="space-y-4">
                <input type="hidden" name="id" value={r.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field name="type" type="select" label="Type" defaultValue="NOTE" options={[{ value: 'NOTE', label: 'Internal note' }, { value: 'MESSAGE', label: 'Message to customer (emailed and shown in portal)' }, { value: 'CALL', label: 'Call log' }, { value: 'MEETING', label: 'Meeting log' }, { value: 'EMAIL', label: 'Email log' }, { value: 'WHATSAPP', label: 'WhatsApp log' }, { value: 'SMS', label: 'SMS log' }]} />
                  <Field name="subject" label="Subject (optional)" />
                </div>
                <Field name="body" type="textarea" label="Details" required />
                <Field name="customerVisible" type="checkbox" label="Show this log entry to the customer in their portal" hint="Internal notes are never shown to customers. Messages are always shown." />
                <SubmitButton>Save</SubmitButton>
              </ActionForm>
            </section>
          )}

          <section className="panel panel-pad">
            <h2 className="!text-lg mb-4">Information requests</h2>
            {r.infoRequests.length === 0 ? <p className="text-steel text-sm">None yet.</p> : (
              <ul className="space-y-4">{r.infoRequests.map((i) => (
                <li key={i.id} className="border-l-4 border-brand pl-4"><p className="text-sm text-steel">{i.askedByLabel} · {fmtDateTime(i.createdAt)} · <Badge tone={i.status === 'OPEN' ? 'warn' : 'good'}>{i.status === 'OPEN' ? 'Waiting for customer' : 'Answered'}</Badge></p>
                  <p className="mt-1 whitespace-pre-wrap">{i.question}</p>
                  {i.answer && <p className="mt-2 bg-paper-2 p-3 whitespace-pre-wrap"><span className="eyebrow block mb-1">Customer reply · {fmtDateTime(i.answeredAt)}</span>{i.answer}</p>}</li>
              ))}</ul>
            )}
            {can(user.role, 'request.status') && (
              <ActionForm action={requestInfoAction} resetOnSuccess className="mt-5 space-y-3 border-t border-line pt-4">
                <input type="hidden" name="id" value={r.id} />
                <Field name="question" type="textarea" label="Ask the customer for more information" rows={3} hint="They are emailed and can reply in the portal. The request moves to “More information required”." />
                <SubmitButton className="btn btn-outline">Send question</SubmitButton>
              </ActionForm>
            )}
          </section>
        </div>

        <div className="space-y-6 min-w-0">
          <section className="panel rule-top panel-pad">
            <h2 className="!text-lg mb-3">Requester</h2>
            <dl className="kv"><dt>Name</dt><dd>{r.requesterName}</dd><dt>Email</dt><dd><a href={`mailto:${r.requesterEmail}`}>{r.requesterEmail}</a></dd><dt>Phone</dt><dd>{r.requesterPhone ?? '—'}</dd>
              <dt>Company</dt><dd>{r.company && can(user.role, 'customer.view') ? <Link href={`/admin/customers/${r.company.id}`}>{r.company.name}</Link> : r.companyName ?? '—'}</dd></dl>
          </section>

          <section className="panel panel-pad">
            <h2 className="!text-lg mb-3">Handling</h2>
            {can(user.role, 'request.assign') ? (
              <ActionForm action={assignAction} className="space-y-3">
                <input type="hidden" name="id" value={r.id} />
                <Field name="assigneeId" type="select" label="Assigned to" defaultValue={r.assigneeId ?? ''} options={[{ value: '', label: 'Unassigned' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} />
                <SubmitButton className="btn btn-outline btn-sm">Save assignment</SubmitButton>
              </ActionForm>
            ) : <p className="text-sm">Assigned to: <strong>{r.assignee?.name ?? 'Unassigned'}</strong></p>}
            {can(user.role, 'request.status') && nextStatuses.length > 0 && (
              <ActionForm action={changeStatusAction} resetOnSuccess className="space-y-3 mt-5 pt-5 border-t border-line">
                <input type="hidden" name="id" value={r.id} />
                <Field name="to" type="select" label="Change status to" required options={[{ value: '', label: 'Select…' }, ...nextStatuses.map((s) => ({ value: s, label: STATUS_LABELS[s] }))]} />
                <Field name="note" type="textarea" rows={2} label="Note" hint="Required for Declined, Cancelled or Closed. Some changes email the customer." />
                <SubmitButton className="btn btn-outline btn-sm">Change status</SubmitButton>
              </ActionForm>
            )}
            {QUOTATION_DRIVEN.length > 0 && <p className="hint mt-3">“Quotation issued” and “Accepted” are set by issuing and accepting a quotation, not by hand.</p>}
          </section>

          <section className="panel panel-pad">
            <h2 className="!text-lg mb-3">Quotations</h2>
            {r.quotations.length === 0 ? <p className="text-steel text-sm">No quotation yet.</p> : (
              <ul className="divide-y divide-line">{r.quotations.map((q) => { const rev = q.revisions[0]; return (
                <li key={q.id} className="py-2.5 flex flex-wrap justify-between gap-2 items-center"><span><Link href={`/admin/quotations/${q.id}`} className="mono font-medium">{q.number}</Link>{rev && <span className="block text-sm text-steel">v{rev.version} · {formatMoney(rev.total.toString(), rev.currency)}</span>}</span><QuotationBadge status={q.status} /></li>
              ); })}</ul>
            )}
          </section>

          <section className="panel panel-pad">
            <h2 className="!text-lg mb-3">Follow-ups</h2>
            {r.tasks.length === 0 ? <p className="text-steel text-sm">None.</p> : (
              <ul className="divide-y divide-line">{r.tasks.map((t) => (
                <li key={t.id} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                  <span className={t.status === 'DONE' ? 'line-through text-steel' : ''}><span className="font-medium">{t.title}</span><span className="block text-steel">Due {fmtDate(t.dueAt)}{t.status === 'OPEN' ? ` (${fmtRelativeDays(t.dueAt)})` : ''}{t.assignee ? ` · ${t.assignee.name}` : ''}</span></span>
                  {can(user.role, 'task.manage') && <ActionButton action={completeTaskAction} hidden={{ taskId: t.id, id: r.id, done: t.status === 'OPEN' ? 'true' : 'false' }}>{t.status === 'OPEN' ? 'Done' : 'Reopen'}</ActionButton>}
                </li>
              ))}</ul>
            )}
            {can(user.role, 'task.manage') && (
              <ActionForm action={createTaskAction} resetOnSuccess className="mt-4 pt-4 border-t border-line space-y-3">
                <input type="hidden" name="id" value={r.id} />
                <Field name="title" label="New follow-up" required />
                <Field name="dueAt" type="date" label="Due date" required defaultValue={defaultDueDate()} />
                <Field name="assigneeId" type="select" label="Owner" defaultValue={user.id} options={staff.map((s) => ({ value: s.id, label: s.name }))} />
                <SubmitButton className="btn btn-outline btn-sm">Add follow-up</SubmitButton>
              </ActionForm>
            )}
            {openTasks.length === 0 && r.tasks.length > 0 && <p className="hint mt-2">No open follow-ups.</p>}
          </section>

          <section className="panel panel-pad">
            <h2 className="!text-lg mb-3">Documents</h2>
            {r.documents.length === 0 ? <p className="text-steel text-sm">No documents.</p> : (
              <ul className="divide-y divide-line">{r.documents.map((d) => (
                <li key={d.id} className="py-2.5 text-sm">{isServable(d.scanStatus) ? <a href={signedFileUrl(d.id, user.id)} className="inline-flex gap-2 items-center font-medium"><Icon name="download" size={15} />{d.originalName}</a> : <span className="inline-flex gap-2 items-center font-medium text-steel"><Icon name="shield" size={15} />{d.originalName}</span>}
                  <span className="block text-steel">{fmtBytes(d.sizeBytes)} · {d.uploadedByLabel} · {fmtDate(d.createdAt)} · {d.visibility === 'CUSTOMER' ? 'Visible to customer' : 'Internal only'}</span>
                  <span className={`block text-xs ${d.scanStatus === 'INFECTED' || d.scanStatus === 'ERROR' ? 'text-ember font-semibold' : 'text-steel'}`}>{SCAN_LABELS[d.scanStatus]}{d.scanDetail ? ` · ${d.scanDetail}` : ''}</span></li>
              ))}</ul>
            )}
            {canNote && (
              <ActionForm action={uploadDocAction} resetOnSuccess className="mt-4 pt-4 border-t border-line space-y-3" encType="multipart/form-data">
                <input type="hidden" name="id" value={r.id} />
                <Field name="files" type="file" label="Upload" multiple accept={ACCEPT_ATTR} hint={ALLOWED_LABEL} />
                <Field name="visibility" type="select" label="Visibility" defaultValue="INTERNAL" options={[{ value: 'INTERNAL', label: 'Internal only' }, { value: 'CUSTOMER', label: 'Visible to the customer' }]} />
                <SubmitButton className="btn btn-outline btn-sm">Upload</SubmitButton>
              </ActionForm>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
