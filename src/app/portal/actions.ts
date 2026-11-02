'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { runAction, str, bool, files, type FormState } from '@/server/action-utils';
import { actionCustomer } from '@/server/rbac';
import { answerInfoRequest, getCustomerRequest } from '@/server/requests';
import { addLinesFromRequest } from '@/server/project-list';
import { recordCustomerDecision } from '@/server/quotations';
import { inviteColleague } from '@/server/portal';
import { clientIp } from '@/server/rate-limit';
import { kick } from '@/server/handlers';
import { invalid } from '@/server/errors';

export async function answerInfoAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionCustomer();
    await answerInfoRequest(user.id, str(fd, 'infoId'), str(fd, 'answer'), files(fd, 'files'));
    revalidatePath(`/portal/requests/${str(fd, 'requestId')}`);
    after(() => kick());
    // the question panel disappears once answered, so confirm on the reloaded page instead
    redirect(`/portal/requests/${str(fd, 'requestId')}?done=replied`);
  });
}

export async function decideQuotationAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionCustomer();
    const decision = str(fd, 'decision') === 'ACCEPTED' ? 'ACCEPTED' : 'DECLINED';
    if (decision === 'ACCEPTED' && !bool(fd, 'authorised')) throw invalid('Please confirm you are authorised to accept this quotation.', { authorised: 'Tick the box to confirm.' });
    const qid = str(fd, 'quotationId');
    await recordCustomerDecision(user.id, qid, decision, str(fd, 'comment'), await clientIp());
    revalidatePath(`/portal/quotations/${qid}`);
    revalidatePath('/portal');
    after(() => kick());
    redirect(`/portal/quotations/${qid}?done=${decision === 'ACCEPTED' ? 'accepted' : 'declined'}`); // the response form disappears once answered
  });
}

export async function inviteAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionCustomer();
    await inviteColleague(user, str(fd, 'companyId'), str(fd, 'email'));
    revalidatePath('/portal/account');
    after(() => kick());
    return 'Invitation sent.';
  });
}

/** Copy the lines of an earlier request onto the customer's project list, then open it. Nothing is sent. */
export async function reorderAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionCustomer();
    const r = await getCustomerRequest(user.id, str(fd, 'id'));
    if (!r.items.length) throw invalid('That request had no catalogue lines to copy.');
    await addLinesFromRequest(r.items.map((i) => ({ productId: i.productId, variantId: i.variantId, label: i.label, unit: i.unit, quantity: Number(i.quantity), note: i.note })));
    revalidatePath('/', 'layout');
    redirect('/list');
  });
}
