import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '@/server/db';
import { resetDb, makeUser, principal, makeService, submission } from './helpers';
import { saveDivision, saveOpportunity, getOpenOpportunities, saveMediaItem, getMediaItems, saveSeo, getSeo, saveSeoSettings, saveDepartments, saveTimelineEntry, getTimeline, saveExecutive } from '@/server/site-content';
import { getSetting } from '@/server/settings';
import { saveStaffPost, listPostsFor, getPostFor, unreadCount, saveMyProfile, listDirectory, addStaffDocument, listStaffDocuments, getStaffDocumentFile, removeStaffDocument } from '@/server/staff-portal';
import { submitRequest } from '@/server/requests';
import { can, isInternal, isStaff } from '@/lib/permissions';

const fail = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as Error & { code?: string }; } };
const pdf = () => new File([new Uint8Array(Buffer.from('%PDF-1.4\nleave policy\n%%EOF\n'))], 'leave-policy.pdf', { type: 'application/pdf' });

let admin: ReturnType<typeof principal>, content: ReturnType<typeof principal>, comms: ReturnType<typeof principal>, ops: ReturnType<typeof principal>;
let emp: ReturnType<typeof principal>, empSales: ReturnType<typeof principal>, customer: ReturnType<typeof principal>;

beforeAll(async () => {
  await resetDb();
  admin = principal(await makeUser('SUPER_ADMIN'));
  content = principal(await makeUser('CONTENT_MANAGER'));
  comms = principal(await makeUser('COMMUNICATIONS'));
  ops = principal(await makeUser('OPS_STAFF'));
  emp = principal(await makeUser('STAFF_MEMBER', { name: 'Ngozi Employee' }));
  empSales = principal(await makeUser('STAFF_MEMBER', { name: 'Sola Sales' }));
  customer = principal(await makeUser('CUSTOMER'));
});

describe('roles', () => {
  it('gives each role only what the brief describes', () => {
    expect(can('CONTENT_MANAGER', 'journal.publish')).toBe(true);
    expect(can('CONTENT_MANAGER', 'division.manage')).toBe(true);
    expect(can('CONTENT_MANAGER', 'social.manage')).toBe(false);
    expect(can('COMMUNICATIONS', 'social.manage')).toBe(true);
    expect(can('COMMUNICATIONS', 'division.manage')).toBe(false);
    expect(can('COMMUNICATIONS', 'user.manage')).toBe(false);
    expect(can('STAFF_MEMBER', 'journal.write')).toBe(false);
    expect(can('STAFF_MEMBER', 'request.view.assigned')).toBe(false);
    expect(isInternal('STAFF_MEMBER')).toBe(true);
    expect(isStaff('STAFF_MEMBER')).toBe(false);
    expect(isInternal('CUSTOMER')).toBe(false);
  });
});

describe('divisions and executive profile', () => {
  const base = { name: 'Bathroom Solutions', tagline: 'Fittings and finishes', summary: 'Bathroom fittings for projects.', description: 'A division description long enough.' };
  it('is allowed for content managers and refused for communications and operations staff', async () => {
    expect((await saveDivision(content, null, base)).slug).toBe('bathroom-solutions');
    expect((await fail(saveDivision(comms, null, { ...base, name: 'Other division' })))?.code).toBe('FORBIDDEN');
    expect((await fail(saveDivision(ops, null, { ...base, name: 'Another division' })))?.code).toBe('FORBIDDEN');
  });
  it('rejects a clashing address and an unknown enquiry type', async () => {
    expect(await fail(saveDivision(admin, null, base))).toBeTruthy();
    const e = await fail(saveDivision(admin, null, { ...base, name: 'Third division', serviceSlug: 'nope' }));
    expect(e?.message).toMatch(/existing request type/);
  });
  it('rejects an unsafe image reference and a non-https social address', async () => {
    expect(await fail(saveDivision(admin, null, { ...base, name: 'Fourth division', imageKey: '../../etc/passwd' }))).toBeTruthy();
    const e = await fail(saveExecutive(content, { headline: 'Captain of Industry', sections: [{ id: 'a', title: 'Section', body: 'Body text that is long enough.' }], linkedin: 'http://insecure.example' }));
    expect(e?.message).toMatch(/https/);
  });
  it('keeps timeline entries honest: a testimonial needs the words and the speaker', async () => {
    const e = await fail(saveTimelineEntry(content, null, { scope: 'geepee', kind: 'TESTIMONIAL', title: 'Kind words', body: '' }));
    expect(e?.message).toMatch(/testimonial/i);
    await saveTimelineEntry(content, null, { scope: 'geepee', kind: 'MILESTONE', title: 'First delivery', visible: false });
    expect(await getTimeline('geepee')).toHaveLength(0); // hidden entries never reach the public page
  });
});

describe('opportunities and media centre', () => {
  it('shows only published, open opportunities', async () => {
    await saveOpportunity(admin, null, { kind: 'PARTNERSHIP', title: 'Partner with us', summary: 'A partnership opportunity.', publish: true });
    await saveOpportunity(admin, null, { kind: 'CAREER', title: 'Draft role', summary: 'A draft role not yet public.', publish: false });
    await saveOpportunity(admin, null, { kind: 'SUPPLIER', title: 'Expired call', summary: 'This call has closed.', publish: true, closesOn: '2020-01-01' });
    const open = await getOpenOpportunities();
    expect(open.map((o) => o.title)).toEqual(['Partner with us']);
  });
  it('accepts YouTube links and refuses other video hosts or insecure links', async () => {
    await saveMediaItem(comms, null, { kind: 'VIDEO', title: 'Keynote clip', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', publish: true });
    expect((await fail(saveMediaItem(comms, null, { kind: 'VIDEO', title: 'Bad host', videoUrl: 'https://evil.example/v.mp4' })))?.message).toMatch(/YouTube and Vimeo/);
    expect((await fail(saveMediaItem(comms, null, { kind: 'PRESS_RELEASE', title: 'Insecure link', url: 'http://x.example' })))?.message).toMatch(/https/);
    expect((await getMediaItems()).map((m) => m.title)).toEqual(['Keynote clip']);
  });
  it('refuses media changes from roles without the permission', async () => {
    expect((await fail(saveMediaItem(ops, null, { kind: 'PRESS_RELEASE', title: 'Not allowed' })))?.code).toBe('FORBIDDEN');
  });
});

describe('SEO', () => {
  it('stores overrides, validates them and removes an emptied entry', async () => {
    await saveSeo(content, '/journal', { title: 'Journal | St. Chris', description: 'Articles and insights.' });
    expect((await getSeo('/journal'))?.title).toBe('Journal | St. Chris');
    expect((await fail(saveSeo(content, 'journal', {})))?.message).toMatch(/start with/);
    expect((await fail(saveSeo(content, '/x', { title: 'x'.repeat(71) })))?.message).toMatch(/70/);
    await saveSeo(content, '/journal', {});
    expect(await getSeo('/journal')).toBeNull();
  });
  it('wants only the verification code, not the whole tag', async () => {
    const e = await fail(saveSeoSettings(content, { searchConsoleToken: '<meta name="google-site-verification" content="abc" />' }));
    expect(e?.message).toMatch(/only the verification code/);
    await saveSeoSettings(content, { searchConsoleToken: 'aBcDeFgHiJkLmNoPqRsT_uVwXyZ-0123456789' });
    expect((await getSetting('seo')).searchConsoleToken).toMatch(/^aBcDe/);
    expect((await fail(saveSeoSettings(comms, {})))?.code).toBe('FORBIDDEN');
  });
});

describe('departments and routing', () => {
  it('validates keys, emails and orphaned request types', async () => {
    const depts = await getSetting('departments');
    expect((await fail(saveDepartments(admin, [...depts, { key: 'Bad Key', label: 'Bad', email: '', description: '' }])))?.message).toMatch(/lower-case/);
    expect((await fail(saveDepartments(admin, [...depts, { key: 'sales', label: 'Dup', email: '', description: '' }])))?.message).toMatch(/twice/);
    expect((await fail(saveDepartments(admin, depts.map((d, i) => (i ? d : { ...d, email: 'not-an-email' })))))?.message).toMatch(/valid email/);
    expect((await fail(saveDepartments(content, depts)))?.code).toBe('FORBIDDEN');
  });
  it('stores the department on a request and refuses to delete one a request type still uses', async () => {
    const svc = await makeService();
    await db.service.update({ where: { id: svc.id }, data: { department: 'procurement' } });
    const r = await submitRequest(submission(svc.id));
    expect((await db.quoteRequest.findUnique({ where: { id: r.id } }))?.department).toBe('procurement');
    const depts = await getSetting('departments');
    const e = await fail(saveDepartments(admin, depts.filter((d) => d.key !== 'procurement')));
    expect(e?.message).toMatch(/routed to/);
    await saveDepartments(admin, depts.map((d) => (d.key === 'procurement' ? { ...d, email: 'procurement@example.test, buyer@example.test' } : d)));
    expect((await getSetting('departments')).find((d) => d.key === 'procurement')?.email).toContain('buyer@');
  });
});

describe('staff portal', () => {
  it('lets an employee read published posts for everyone and for their department, never drafts or other departments', async () => {
    await saveMyProfile(empSales, { department: 'sales', jobTitle: 'Sales executive' });
    await saveStaffPost(comms, null, { kind: 'ANNOUNCEMENT', title: 'Office closed Friday', body: 'The office is closed on Friday.', publish: true });
    await saveStaffPost(comms, null, { kind: 'DEPARTMENT', title: 'Sales target update', body: 'New sales targets for this quarter.', department: 'sales', publish: true });
    await saveStaffPost(comms, null, { kind: 'DEPARTMENT', title: 'Procurement only', body: 'Supplier review for procurement staff.', department: 'procurement', publish: true });
    await saveStaffPost(comms, null, { kind: 'CIRCULAR', title: 'Unreleased draft', body: 'This circular is still a draft.' });
    expect((await listPostsFor(emp)).map((p) => p.title).sort()).toEqual(['Office closed Friday']);
    expect((await listPostsFor(empSales)).map((p) => p.title).sort()).toEqual(['Office closed Friday', 'Sales target update']);
  });
  it('tracks what has been read', async () => {
    expect(await unreadCount(emp)).toBe(1);
    const p = (await listPostsFor(emp))[0]!;
    await getPostFor(emp, p.id);
    expect(await unreadCount(emp)).toBe(0);
    expect(await unreadCount(empSales)).toBe(2);
  });
  it('hides posts from other departments even by direct address', async () => {
    const hidden = await db.staffPost.findFirst({ where: { title: 'Procurement only' } });
    expect(await fail(getPostFor(empSales, hidden!.id))).toBeTruthy();
  });
  it('keeps customers out entirely and employees out of authoring', async () => {
    expect((await fail(listPostsFor(customer)))?.code).toBe('FORBIDDEN');
    expect((await fail(saveStaffPost(emp, null, { kind: 'ANNOUNCEMENT', title: 'Sneaky post', body: 'Employees cannot publish.' })))?.code).toBe('FORBIDDEN');
    expect((await fail(addStaffDocument(emp, pdf(), { title: 'Sneaky doc' })))?.code).toBe('FORBIDDEN');
  });
  it('lists only people who chose to be in the directory', async () => {
    await saveMyProfile(emp, { showInDirectory: false });
    const names = (await listDirectory(empSales)).map((p) => p.name);
    expect(names).not.toContain('Ngozi Employee');
    expect(names).toContain('Sola Sales');
    expect(names).not.toContain(customer.name);
  });
  it('serves approved documents to staff only, scoped by department, and removes them cleanly', async () => {
    const d = await addStaffDocument(comms, pdf(), { title: 'Leave policy', category: 'Policies' });
    await addStaffDocument(comms, pdf(), { title: 'Procurement manual', department: 'procurement' });
    expect((await listStaffDocuments(emp)).map((x) => x.title)).toEqual(['Leave policy']);
    expect((await getStaffDocumentFile(emp, d.id))?.data.length).toBeGreaterThan(10);
    expect((await fail(getStaffDocumentFile(customer, d.id)))?.code).toBe('FORBIDDEN');
    // the document must never be reachable through the public documents route: it is INTERNAL
    expect((await db.document.findUnique({ where: { id: d.documentId } }))?.visibility).toBe('INTERNAL');
    await removeStaffDocument(comms, d.id);
    expect(await getStaffDocumentFile(emp, d.id)).toBeNull();
  });
});
