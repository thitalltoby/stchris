import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'DevPassword-123';
export const STAFF = { admin: 'admin@stchris.local', ops: 'ops@stchris.local', opsStaff: 'staff@stchris.local', commercial: 'commercial@stchris.local', approver: 'approver@stchris.local' };

export async function loginStaff(page: Page, email: string) {
  await page.goto('/admin/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}

export const pdfBuffer = () => Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

/** Add the seeded black tank to the project list from its product page. */
export async function addTank(page: Page, qty = '3') {
  await page.goto('/products/vertical-water-storage-tank-black');
  await page.getByLabel('Quantity').fill(qty);
  await page.getByRole('button', { name: 'Add to project list' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'added' })).toBeVisible();
}

/** Add a line that is not in the catalogue, from the project list page. */
export async function addFreeLine(page: Page, label: string, qty: string, unit: string) {
  await page.goto('/list');
  const form = page.getByRole('form', { name: 'Add an item that is not in the catalogue' });
  await form.getByLabel('Item').fill(label);
  await form.getByLabel('Quantity').fill(qty);
  await form.getByLabel('Unit').fill(unit);
  await form.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText(`${label} added.`).first()).toBeAttached();
}

/** Go from the project list through the request builder to the review step. */
export async function buildRequest(page: Page, who: { name: string; email: string; phone: string; company: string }, opts: { file?: boolean } = {}) {
  // the builder restores an unsent draft from this browser tab; start every load from a clean slate
  await page.addInitScript(() => { try { sessionStorage.removeItem('stchris-request-draft'); } catch { /* ignore */ } });
  await page.goto('/request?service=materials-quotation');
  await expect(page.getByRole('heading', { name: 'Check your list' })).toBeVisible();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByLabel('Project or reference').fill('Block C bathrooms (test)');
  await page.getByLabel('What is it for?').selectOption('Renovation or refurbishment');
  await page.getByLabel('Delivery or collection').selectOption('Deliver to site');
  await page.getByLabel('Site or delivery location').fill('Lekki, Lagos');
  if (opts.file) await page.locator('#f-files').setInputFiles({ name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
  if (opts.file) await expect(page.getByText(/not an accepted file type/)).toBeVisible();
  if (opts.file) await page.locator('#f-files').setInputFiles({ name: 'boq.pdf', mimeType: 'application/pdf', buffer: pdfBuffer() });
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByLabel('Full name').fill(who.name);
  await page.getByLabel('Email address').fill(who.email);
  await page.getByLabel('Phone number').fill(who.phone);
  await page.getByRole('textbox', { name: 'Company' }).fill(who.company);
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.getByRole('heading', { name: 'Review and submit' })).toBeVisible();
}
