'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { runAction, str, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { saveRevision, submitForApproval, decideApproval, issueQuotation, reviseQuotation, withdrawQuotation, recordOfflineResponse } from '@/server/quotations';
import { saveUpload } from '@/server/storage';
import { deleteStored } from '@/server/storage';
import { kick } from '@/server/handlers';
import { invalid } from '@/server/errors';
import { files } from '@/server/action-utils';

const refresh = (id: string) => { revalidatePath(`/admin/quotations/${id}`); revalidatePath('/admin/quotations'); after(() => kick()); };

function parseLines(fd: FormData) {
  try {
    const v = JSON.parse(str(fd, 'lines') || '[]');
    if (!Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw invalid('The line items could not be read. Reload the page and try again.');
  }
}

function revisionInput(fd: FormData) {
  return {
    title: str(fd, 'title'), introduction: str(fd, 'introduction'), terms: str(fd, 'terms'), paymentTerms: str(fd, 'paymentTerms'),
    currency: str(fd, 'currency') || 'NGN', validityDays: str(fd, 'validityDays') || '14', lines: parseLines(fd),
  };
}

export async function saveRevisionAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    const revisionId = str(fd, 'revisionId');
    const totals = await saveRevision(user, revisionId, revisionInput(fd));
    // "Save and submit" saves first so the approver always sees exactly what was on screen
    if (str(fd, '__submit') === '1') {
      const needs = await submitForApproval(user, revisionId);
      refresh(str(fd, 'quotationId'));
      return needs ? 'Saved and submitted for approval.' : 'Saved. Under the approval policy this total needs no approval, so it can be issued now.';
    }
    refresh(str(fd, 'quotationId'));
    return `Saved. Total ${totals.total}.`;
  });
}

export async function decideAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    const decision = str(fd, 'decision') === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    await decideApproval(user, str(fd, 'revisionId'), decision, str(fd, 'comment'));
    refresh(str(fd, 'quotationId'));
    return decision === 'APPROVED' ? 'Approved.' : 'Returned to the preparer with your comment.';
  });
}

export async function issueAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    await issueQuotation(user, str(fd, 'revisionId'));
    refresh(str(fd, 'quotationId'));
    return 'Issued. The customer has been notified and can respond in the portal.';
  });
}

export async function reviseAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    await reviseQuotation(user, str(fd, 'quotationId'));
    refresh(str(fd, 'quotationId'));
    return 'A new draft revision has been created.';
  });
}

export async function withdrawAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    await withdrawQuotation(user, str(fd, 'quotationId'), str(fd, 'reason'));
    refresh(str(fd, 'quotationId'));
    return 'Withdrawn.';
  });
}

export async function recordOfflineAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    const evidenceFile = files(fd, 'evidence')[0];
    const stored = evidenceFile ? await saveUpload(evidenceFile) : null;
    try {
      await recordOfflineResponse(user, str(fd, 'quotationId'), {
        decision: str(fd, 'decision'), channel: str(fd, 'channel'), respondentName: str(fd, 'respondentName'), respondentEmail: str(fd, 'respondentEmail'),
        occurredAt: str(fd, 'occurredAt'), reference: str(fd, 'reference'), note: str(fd, 'note'),
      }, stored);
    } catch (e) {
      if (stored) await deleteStored(stored.storageKey).catch(() => undefined);
      throw e;
    }
    refresh(str(fd, 'quotationId'));
    return str(fd, 'decision') === 'ACCEPTED' ? 'Acceptance recorded. The request has moved to Accepted.' : 'Decline recorded.';
  });
}
