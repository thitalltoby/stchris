import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/server/db';
import { submitRequest, createTask, completeTask, attachDocuments, getCustomerRequest, getRepeatPrefill, changeStatus, listCustomerRequests } from '@/server/requests';
import { saveCompany, saveContact, addCompanyNote, listCompanies, getCompany } from '@/server/customers';
import { saveFaq, deleteFaq } from '@/server/content';
import { inviteColleague } from '@/server/portal';
import { registerCustomer } from '@/server/auth';
import { sendTaskReminders } from '@/server/handlers';
import { AppError } from '@/server/errors';
import { resetDb, makeUser, makeService, principal, submission, pdfFile, PASSWORD } from './helpers';

const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof AppError ? e.code : `ERR:${e}`));
let serviceId: string;
beforeEach(async () => {
  await resetDb();
  serviceId = (await makeService()).id;
});

describe('follow-up tasks', () => {
  it('creates tasks tied to a request the creator may see, completes them, and sends one reminder when due', async () => {
    const ops = await makeUser('OPS_ADMIN');
    const staff = await makeUser('OPS_STAFF');
    const other = await makeUser('OPS_STAFF');
    const r = await submitRequest(submission(serviceId));
    await db.quoteRequest.update({ where: { id: r.id }, data: { assigneeId: staff.id } });

    expect(await code(createTask(principal(other), { title: 'Not mine', dueAt: new Date(), requestId: r.id }))).toBe('NOT_FOUND'); // cannot see the request
    expect(await code(createTask(principal(staff), { title: ' ', dueAt: new Date() }))).toBe('VALIDATION');
    const t = await createTask(principal(staff), { title: 'Call customer', dueAt: new Date(Date.now() - 60_000), requestId: r.id });
    expect(t.assigneeId).toBe(staff.id);

    expect(await sendTaskReminders()).toBe(1);
    expect(await sendTaskReminders()).toBe(0); // only once
    expect(await db.notificationEvent.count({ where: { type: 'task.reminder', toAddress: staff.email } })).toBe(1);

    await completeTask(principal(staff), t.id);
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('DONE');
    expect(await code(completeTask(principal(other), t.id))).toBe('NOT_FOUND');
    await completeTask(principal(staff), t.id, false);
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('OPEN');
    expect(await code(createTask(principal(await makeUser('APPROVER')), { title: 'x', dueAt: new Date() }))).toBe('FORBIDDEN');
    void ops;
  });
});

describe('customers (CRM)', () => {
  it('lets commercial and operations staff maintain companies, contacts and notes; approvers can only look', async () => {
    const commercial = await makeUser('COMMERCIAL');
    const approver = await makeUser('APPROVER');
    const c = await saveCompany(principal(commercial), null, { name: 'Acme Marine Ltd', industry: 'Shipping' });
    await saveContact(principal(commercial), c.id, null, { name: 'Tolu Bello', email: 'TOLU@acme.test', phone: '+234 800 000 0007' });
    expect(await code(saveContact(principal(commercial), c.id, null, { name: 'Tolu Bello', email: 'tolu@acme.test' }))).toBe('CONFLICT');
    await addCompanyNote(principal(commercial), c.id, 'Met at the Lagos port expo.', 'MEETING');
    expect(await code(addCompanyNote(principal(commercial), c.id, '   '))).toBe('VALIDATION');
    expect(await code(saveCompany(principal(approver), c.id, { name: 'Renamed' }))).toBe('FORBIDDEN');
    expect(await code(saveCompany(principal(commercial), c.id, { name: 'Acme Marine Ltd', ownerId: approver.id }))).toBe('OK');
    const full = await getCompany(principal(approver), c.id);
    expect(full.contacts[0]!.email).toBe('tolu@acme.test');
    expect(full.communications).toHaveLength(1);
    expect((await listCompanies(principal(approver), { q: 'acme' })).total).toBe(1);
    expect(await code(listCompanies(principal(await makeUser('OPS_STAFF')), {}))).toBe('OK');
    expect(await code(listCompanies(principal(await makeUser('CUSTOMER')), {}))).toBe('FORBIDDEN');
  });
});

describe('documents', () => {
  it('keeps staff-only documents away from the customer', async () => {
    const ops = await makeUser('OPS_ADMIN');
    const { userId } = await registerCustomer({ name: 'Ada Okafor', email: 'ada@example.test', password: PASSWORD, companyName: 'Ada Energy Ltd' });
    await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    await db.contact.updateMany({ where: { email: 'ada@example.test' }, data: { userId } });
    const r = await submitRequest(submission(serviceId));
    await attachDocuments(principal(ops), r.id, [pdfFile('internal.pdf')], 'INTERNAL');
    await attachDocuments(principal(ops), r.id, [pdfFile('for-customer.pdf')], 'CUSTOMER');
    const view = await getCustomerRequest(userId, r.id);
    expect(view.documents.map((d) => d.originalName)).toEqual(['for-customer.pdf']);
    expect(await code(attachDocuments(principal(ops), r.id, [], 'CUSTOMER'))).toBe('VALIDATION');
    expect(await code(attachDocuments(principal(await makeUser('APPROVER')), r.id, [pdfFile()], 'CUSTOMER'))).toBe('FORBIDDEN');
  });

  it('never exposes internal notes in the customer view', async () => {
    const ops = await makeUser('OPS_ADMIN');
    const { userId } = await registerCustomer({ name: 'Ada Okafor', email: 'ada@example.test', password: PASSWORD, companyName: 'Ada Energy Ltd' });
    await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    await db.contact.updateMany({ where: { email: 'ada@example.test' }, data: { userId } });
    const r = await submitRequest(submission(serviceId));
    await db.communication.create({ data: { type: 'NOTE', direction: 'INTERNAL', body: 'SECRET-INTERNAL-NOTE', requestId: r.id, authorId: ops.id, authorLabel: ops.name } });
    const view = await getCustomerRequest(userId, r.id);
    expect(JSON.stringify(view)).not.toContain('SECRET-INTERNAL-NOTE');
  });
});

describe('customer status emails', () => {
  it('emails the customer for configured statuses only, and not when the change is silent', async () => {
    const ops = await makeUser('OPS_ADMIN');
    const r = await submitRequest(submission(serviceId));
    await changeStatus(principal(ops), r.id, 'UNDER_REVIEW');
    expect(await db.notificationEvent.count({ where: { requestId: r.id, type: 'request.status' } })).toBe(0);
    await changeStatus(principal(ops), r.id, 'DECLINED', 'Outside our service area');
    const m = await db.notificationEvent.findFirstOrThrow({ where: { requestId: r.id, type: 'request.status' } });
    expect(m).toMatchObject({ toAddress: 'ada@example.test' });
    expect(m.subject).toContain('Declined');
  });
});

describe('company colleagues and repeat requests', () => {
  async function owner() {
    const { userId } = await registerCustomer({ name: 'Owner One', email: 'owner@acme.test', password: PASSWORD, companyName: 'Acme Ltd' });
    await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    const m = await db.companyMembership.findFirstOrThrow({ where: { userId } });
    return { userId, companyId: m.companyId };
  }

  it('lets only the owner invite, binds the invitation to one address, and gives the colleague the company’s requests', async () => {
    const { userId, companyId } = await owner();
    const me = principal({ id: userId, name: 'Owner One', email: 'owner@acme.test', role: 'CUSTOMER' });
    const stranger = await makeUser('CUSTOMER');
    expect(await code(inviteColleague(principal(stranger), companyId, 'x@acme.test'))).toBe('FORBIDDEN');
    expect(await code(inviteColleague(me, companyId, 'not-an-email'))).toBe('VALIDATION');
    await inviteColleague(me, companyId, 'colleague@acme.test');

    // an owner's request, attached to the company
    const r = await submitRequest(submission(serviceId, { customer: { name: 'Owner One', email: 'owner@acme.test', phone: '+234 800 000 0008', companyName: 'Acme Ltd' } }), { user: { id: userId } });
    await db.quoteRequest.update({ where: { id: r.id }, data: { companyId } });

    const mail = await db.notificationEvent.findFirstOrThrow({ where: { type: 'company.invite' } });
    const token = /invite=([\w-]+)/.exec(mail.body)![1]!;
    expect(await code(registerCustomer({ name: 'Wrong Person', email: 'someone.else@acme.test', password: PASSWORD, companyName: '', inviteToken: token }))).toBe('VALIDATION');
    const { userId: colleague } = await registerCustomer({ name: 'Colleague', email: 'colleague@acme.test', password: PASSWORD, companyName: '', inviteToken: token });
    expect((await listCustomerRequests(colleague)).map((x) => x.id)).toEqual([r.id]);
    expect(await code(registerCustomer({ name: 'Replay', email: 'colleague@acme.test', password: PASSWORD, companyName: '', inviteToken: token }))).toBe('OK'); // existing address: no information leaked
    expect(await listCustomerRequests(stranger.id)).toHaveLength(0);
  });

  it('prefills a repeat request only from the customer’s own requests', async () => {
    const { userId } = await owner();
    const r = await submitRequest(submission(serviceId, { customer: { name: 'Owner One', email: 'owner@acme.test', phone: '+234 800 000 0008', companyName: 'Acme Ltd' } }), { user: { id: userId } });
    expect((await getRepeatPrefill(userId, r.id)).serviceId).toBe(serviceId);
    const stranger = await makeUser('CUSTOMER');
    expect(await code(getRepeatPrefill(stranger.id, r.id))).toBe('NOT_FOUND');
  });
});

describe('website content', () => {
  it('keeps FAQ edits to content managers', async () => {
    const ops = await makeUser('OPS_ADMIN');
    const commercial = await makeUser('COMMERCIAL');
    await saveFaq(principal(ops), null, { question: 'How do I start?', answer: 'Submit a request.' });
    expect(await code(saveFaq(principal(ops), null, { question: 'x', answer: 'y' }))).toBe('VALIDATION');
    expect(await code(saveFaq(principal(commercial), null, { question: 'Another one?', answer: 'Nope.' }))).toBe('FORBIDDEN');
    const faq = await db.faq.findFirstOrThrow();
    await deleteFaq(principal(ops), faq.id);
    expect(await db.faq.count()).toBe(0);
  });
});
