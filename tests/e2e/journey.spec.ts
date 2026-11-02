import { test, expect, type Browser, type Page } from '@playwright/test';
import { STAFF, PASSWORD, loginStaff, addTank, addFreeLine, buildRequest } from './helpers';

const stamp = Date.now();
const customer = { name: 'Ada Okafor', email: `ada.${stamp}@example.test`, phone: '+234 800 000 0001', company: `Test Co ${stamp}` };
let reference = '';
let requestUrl = '';
let docPath = ''; // a signed download link minted for the operations admin

async function ctxPage(browser: Browser) {
  const ctx = await browser.newContext();
  return { ctx, page: await ctx.newPage() };
}
async function loginCustomer(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/portal/);
}
async function openRequestAsStaff(page: Page) {
  await page.goto(`/admin/requests?q=${reference}`);
  await page.getByRole('link', { name: reference }).first().click();
  await expect(page.getByRole('heading', { name: reference })).toBeVisible();
}

test.describe.serial('project list to accepted quotation', () => {
  test('a guest builds a list, the builder validates, and the request is sent once', async ({ page }) => {
    // an empty list cannot be sent
    await page.goto('/list');
    await expect(page.getByText('Your project list is empty')).toBeVisible();
    await page.goto('/request?service=materials-quotation');
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page.getByText(/Add at least one item/).first()).toBeVisible();

    await addTank(page, '3');
    await addFreeLine(page, 'Cement 42.5R (test)', '100', 'bag');
    await page.goto('/list');
    await expect(page.getByRole('list', { name: 'Lines on your project list' }).getByRole('listitem')).toHaveCount(2);
    await expect(page.getByText('Vertical water storage tank, black').first()).toBeVisible();
    // the list survives a reload (it lives on the server, not in the page)
    await page.reload();
    await expect(page.getByText('Cement 42.5R (test)').first()).toBeVisible();

    // required details are enforced
    await page.addInitScript(() => { try { sessionStorage.removeItem('stchris-request-draft'); } catch { /* ignore */ } });
    await page.goto('/request?service=materials-quotation');
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page.getByText('Site or delivery location is required.')).toBeVisible();
    await expect(page.getByLabel('Site or delivery location')).toHaveAttribute('aria-invalid', 'true');

    await buildRequest(page, customer, { file: true });
    await expect(page.getByText('This is a request, not an order.')).toBeVisible();
    await expect(page.getByText('Cement 42.5R (test)').first()).toBeVisible();
    // consent required
    await page.getByRole('button', { name: 'Send for quotation' }).click();
    await expect(page.getByText('Please confirm you have read the privacy notice.')).toBeVisible();
    await page.getByLabel(/I have read the/).check();
    await page.getByRole('button', { name: 'Send for quotation' }).dblclick(); // double-click must not create two requests
    await expect(page).toHaveURL(/\/request\/confirmation\/SCG-\d{4}-\d{5}\?t=/);
    reference = (await page.getByTestId('reference').textContent())!.trim();
    expect(reference).toMatch(/^SCG-\d{4}-\d{5}$/);
    await expect(page.getByText('This is not an order or a quotation.')).toBeVisible();
    await expect(page.getByText('Vertical water storage tank, black')).toBeVisible();
    await expect(page.getByText('Cement 42.5R (test)')).toBeVisible();
    await expect(page.getByText('boq.pdf')).toBeVisible();
    // the list is emptied once it has been sent
    await page.goto('/list');
    await expect(page.getByText('Your project list is empty')).toBeVisible();
  });

  test('the confirmation page needs its token', async ({ page }) => {
    const res = await page.goto(`/request/confirmation/${reference}`);
    expect(res?.status()).toBe(404);
    const res2 = await page.goto(`/request/confirmation/${reference}?t=wrong`);
    expect(res2?.status()).toBe(404);
  });

  test('operations admin sees exactly one request, assigns it and asks for information', async ({ browser }) => {
    const { ctx, page } = await ctxPage(browser);
    await loginStaff(page, STAFF.ops);
    await page.goto(`/admin/requests?q=${customer.email}`);
    await expect(page.getByRole('link', { name: /^SCG-/ })).toHaveCount(1);
    await openRequestAsStaff(page);
    requestUrl = page.url();
    // the items the customer asked for are shown with their catalogue wording
    const items = page.getByRole('table', { name: 'Items requested' });
    await expect(items.getByText('Vertical water storage tank, black')).toBeVisible();
    await expect(items.getByText('Cement 42.5R (test)')).toBeVisible();
    await expect(page.getByText('Lekki, Lagos').first()).toBeVisible();
    // the customer's attachment downloads, as a real PDF, for the person it was minted for
    docPath = (await page.getByRole('link', { name: 'boq.pdf' }).getAttribute('href'))!;
    const dl = await page.request.get(docPath);
    expect(dl.status()).toBe(200);
    expect(dl.headers()['content-disposition']).toContain('attachment');
    expect((await dl.body()).subarray(0, 5).toString()).toBe('%PDF-');
    await page.getByLabel('Assigned to').selectOption({ label: 'Dev Operations Staff' });
    await page.getByRole('button', { name: 'Save assignment' }).click();
    await expect(page.getByText('Assignment saved.')).toBeVisible();
    await page.getByLabel('Ask the customer for more information').fill('Please confirm the delivery window.');
    await page.getByRole('button', { name: 'Send question' }).click();
    await expect(page.getByText('The customer has been asked for more information.')).toBeVisible();
    await page.reload();
    await expect(page.locator('p.flex').getByText('More information required').first()).toBeVisible();
    // a customer-facing reason is mandatory for declining
    await page.getByLabel('Change status to').selectOption({ label: 'Declined' });
    await page.getByRole('button', { name: 'Change status' }).click();
    await expect(page.getByText(/reason is required|record a reason/i).first()).toBeVisible();
    await ctx.close();
  });

  test('the customer registers with the same email, sees the request and replies', async ({ browser }) => {
    const { ctx, page } = await ctxPage(browser);
    await page.goto(`/register?email=${encodeURIComponent(customer.email)}`);
    await page.getByLabel('Full name').fill(customer.name);
    await page.getByLabel('Phone number').fill(customer.phone);
    await page.getByRole('textbox', { name: 'Company' }).fill(customer.company);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('input[name="confirm"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/login\?registered=1/);
    await loginCustomer(page, customer.email);
    await expect(page.getByText('We need information from you')).toBeVisible();
    await page.goto('/portal/requests');
    await page.getByRole('link', { name: reference }).click();
    await expect(page.getByText('Please confirm the delivery window.').first()).toBeVisible();
    await page.getByLabel('Your reply').fill('Weekdays after 9am.');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByText('Your reply has been sent to the St. Chris team.')).toBeVisible();
    await expect(page).toHaveURL(/done=replied/);
    await expect(page.getByText('Under review').first()).toBeVisible();
    // internal notes and staff-only documents never reach the portal
    await expect(page.getByText('Assigned to Dev Operations Staff')).toHaveCount(0);
    await ctx.close();
  });

  test('commercial prepares a quotation and submits it for approval', async ({ browser }) => {
    const { ctx, page } = await ctxPage(browser);
    await loginStaff(page, STAFF.commercial);
    await openRequestAsStaff(page);
    await page.getByRole('button', { name: 'New quotation' }).click();
    await expect(page).toHaveURL(/\/admin\/quotations\//);
    // the quotation starts from what was asked for; prices are for a person to fill in
    await expect(page.locator('#d0')).toHaveValue('Vertical water storage tank, black');
    await expect(page.locator('#q0')).toHaveValue('3');
    await expect(page.locator('#d1')).toHaveValue('Cement 42.5R (test)');
    await expect(page.getByText(/Some lines have no price yet/)).toBeVisible();
    await page.locator('#p0').fill('100000');
    await page.locator('#p1').fill('7000');
    await expect(page.getByText('₦1,000,000.00').first()).toBeVisible();
    await expect(page.getByText(/Some lines have no price yet/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Save and submit for approval' }).click();
    // the editor is replaced by the read-only view once submitted
    await expect(page.getByText('Waiting for an approver.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Pending approval').first()).toBeVisible();
    // the preparer cannot approve their own quotation, and nobody can edit a submitted revision
    await expect(page.locator('#d0')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await ctx.close();
  });

  test('a different approver approves; commercial issues it', async ({ browser }) => {
    const a = await ctxPage(browser);
    await loginStaff(a.page, STAFF.approver);
    await a.page.goto('/admin/quotations?status=PENDING_APPROVAL');
    await a.page.getByRole('link', { name: /^QT-/ }).first().click();
    await a.page.getByLabel('Comment').fill('Looks fine.');
    await a.page.getByRole('button', { name: 'Approve' }).click();
    await expect(a.page.getByText('Approved.')).toBeVisible();
    await a.ctx.close();

    const c = await ctxPage(browser);
    await loginStaff(c.page, STAFF.commercial);
    await c.page.goto('/admin/quotations?status=APPROVED');
    await c.page.getByRole('link', { name: /^QT-/ }).first().click();
    await c.page.getByRole('button', { name: 'Issue to customer' }).click();
    await expect(c.page.locator('main p', { hasText: /Issued\s*Version 1/ })).toBeVisible();
    // staff can record an offline answer; the form asks for what the record needs
    await expect(c.page.getByRole('heading', { name: 'Record an offline answer' })).toBeVisible();
    await c.page.getByRole('button', { name: 'Record answer' }).click();
    await expect(c.page.getByLabel('Who answered')).toBeFocused();
    // PDF is available to staff and is a real PDF
    const href = await c.page.getByRole('link', { name: /Download PDF/ }).getAttribute('href');
    const res = await c.page.request.get(href!);
    expect(res.headers()['content-type']).toContain('application/pdf');
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
    await c.ctx.close();
  });

  test('the customer can copy the request back onto a new list', async ({ browser }) => {
    const { ctx, page } = await ctxPage(browser);
    await loginCustomer(page, customer.email);
    await page.goto('/portal/requests');
    await page.getByRole('link', { name: reference }).click();
    await expect(page.getByRole('table', { name: 'Items requested' })).toBeVisible();
    await page.getByRole('button', { name: 'Add these to a new list' }).click();
    await expect(page).toHaveURL(/\/list$/);
    await expect(page.getByText('Cement 42.5R (test)').first()).toBeVisible();
    await expect(page.getByText('Vertical water storage tank, black').first()).toBeVisible();
    await ctx.close();
  });

  test('the customer reviews, downloads and accepts the quotation', async ({ browser }) => {
    const { ctx, page } = await ctxPage(browser);
    await loginCustomer(page, customer.email);
    await page.goto('/portal/requests');
    await page.getByRole('link', { name: reference }).click();
    await expect(page.getByText('Quotation issued').first()).toBeVisible();
    await page.getByRole('link', { name: 'Review and respond' }).click();
    await expect(page.getByText('₦1,000,000.00').first()).toBeVisible();
    const href = await page.getByRole('link', { name: 'Download PDF' }).getAttribute('href');
    const pdf = await page.request.get(href!);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
    // acceptance needs the authority box
    await page.getByRole('button', { name: 'Accept quotation' }).click();
    await expect(page.getByText('Tick the box to confirm.')).toBeVisible();
    await page.getByLabel(/I am authorised/).check();
    await page.getByRole('button', { name: 'Accept quotation' }).click();
    await expect(page.getByText('Your acceptance has been recorded')).toBeVisible();
    await expect(page).toHaveURL(/done=accepted/);
    await expect(page.getByText('Accepted').first()).toBeVisible();
    // it cannot be answered twice
    await expect(page.getByRole('button', { name: 'Accept quotation' })).toHaveCount(0);
    await ctx.close();
  });

  test('staff see the accepted outcome, the audit trail and the CSV export', async ({ browser }) => {
    const { ctx, page } = await ctxPage(browser);
    await loginStaff(page, STAFF.admin);
    await openRequestAsStaff(page);
    await expect(page.locator('p.flex').getByText('Accepted').first()).toBeVisible();
    await expect(page.getByText(/Customer accepted QT-/)).toBeVisible();
    await page.goto(`/admin/audit?q=quotation`);
    await expect(page.getByText('quotation.customer_accepted')).toBeVisible();
    const csv = await page.request.get('/admin/reports/export');
    expect(csv.headers()['content-type']).toContain('text/csv');
    expect(await csv.text()).toContain(reference);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // the email outbox recorded notifications and never shows message bodies
    await page.goto('/admin/notifications');
    await expect(page.getByText('quotation.issued').first()).toBeVisible();
    await ctx.close();
  });

  test('permissions: roles, scopes and other customers are enforced', async ({ browser }) => {
    const ops = await ctxPage(browser);
    await loginStaff(ops.page, STAFF.opsStaff);
    await ops.page.goto('/admin/users');
    await expect(ops.page).toHaveURL(/\/admin\/forbidden/);
    await ops.page.goto('/admin/settings');
    await expect(ops.page).toHaveURL(/\/admin\/forbidden/);
    // assigned to this person, so visible; an unrelated request would not be
    const res = await ops.page.goto(requestUrl);
    expect(res?.status()).toBe(200);
    // a link whose signature has been altered is refused even for the right user
    expect((await ops.page.request.get(docPath.replace(/sig=./, 'sig=x'))).status()).toBe(404);
    await ops.ctx.close();

    const other = await ctxPage(browser);
    await other.page.goto('/register');
    const email = `other.${stamp}@example.test`;
    await other.page.getByLabel('Full name').fill('Other Person');
    await other.page.getByLabel('Email address').fill(email);
    await other.page.getByRole('textbox', { name: 'Company' }).fill(`Other Co ${stamp}`);
    await other.page.locator('input[name="password"]').fill(PASSWORD);
    await other.page.locator('input[name="confirm"]').fill(PASSWORD);
    await other.page.getByRole('button', { name: 'Create account' }).click();
    await loginCustomer(other.page, email);
    const id = requestUrl.split('/').pop()!;
    const r1 = await other.page.goto(`/portal/requests/${id}`);
    expect(r1?.status()).toBe(404);
    // someone else's signed link is useless to a different signed-in user
    expect((await other.page.request.get(docPath)).status()).toBe(404);
    await other.page.goto('/admin');
    // a customer session is sent back to the portal and never sees console content
    await expect(other.page).toHaveURL(/\/portal/);
    await expect(other.page.getByRole('heading', { level: 1 })).toBeVisible();
    expect((await other.page.request.get('/admin/reports/export')).status()).not.toBe(200);
    await other.ctx.close();
  });

  test('every console page and detail page opens for the Super Admin without errors', async ({ browser }) => {
    const { ctx, page } = await ctxPage(browser);
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console ${m.text()}`); });
    await loginStaff(page, STAFF.admin);
    const lists = ['/admin', '/admin/requests', '/admin/quotations', '/admin/customers', '/admin/tasks', '/admin/services', '/admin/catalogue', '/admin/content', '/admin/reports', '/admin/users', '/admin/integrations', '/admin/notifications', '/admin/audit', '/admin/settings', '/admin/account'];
    for (const path of lists) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBeLessThan(400);
      await expect(page.getByRole('heading', { level: 1 }).first(), path).toBeVisible();
    }
    // follow the first detail link on each list that has one
    for (const seg of ['requests', 'quotations', 'customers', 'services', 'catalogue/products']) {
      const list = seg.startsWith('catalogue') ? '/admin/catalogue' : `/admin/${seg}`;
      await page.goto(list);
      const href = await page.locator(`main a[href^="/admin/${seg}/"]`).first().getAttribute('href');
      expect(href, `no detail link on ${list}`).toBeTruthy();
      const res = await page.goto(href!);
      expect(res?.status(), href!).toBeLessThan(400);
      await expect(page.getByRole('heading', { level: 1 }).first(), href!).toBeVisible();
    }
    expect(problems).toEqual([]);
    await ctx.close();
  });

  test('every portal page opens for a customer without errors', async ({ browser }) => {
    const { ctx, page } = await ctxPage(browser);
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console ${m.text()}`); });
    await loginCustomer(page, customer.email);
    for (const path of ['/portal', '/portal/requests', '/portal/account', `/portal/requests/${requestUrl.split('/').pop()}`]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBeLessThan(400);
      await expect(page.getByRole('heading', { level: 1 }).first(), path).toBeVisible();
    }
    expect(problems).toEqual([]);
    await ctx.close();
  });
});
