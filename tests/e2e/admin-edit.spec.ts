import { test, expect } from '@playwright/test';
import { STAFF, loginStaff } from './helpers';

const stamp = Date.now();

test.describe.serial('editing screens', () => {
  test.beforeEach(async ({ page }) => { await loginStaff(page, STAFF.admin); });

  test('company details saved in Settings appear on the public site', async ({ page }) => {
    await page.goto('/admin/settings');
    const phone = `+234 (0) 800 ${String(stamp).slice(-3)} 2222`;
    await page.getByLabel('Telephone').fill(phone);
    await page.getByRole('button', { name: 'Save company details' }).click();
    await expect(page.getByText('Company details saved.')).toBeVisible();
    await page.context().clearCookies();
    await page.goto('/contact');
    await expect(page.getByText(phone).first()).toBeVisible();
  });

  test('a new product with a priced size: published on the site, price never shown, draft hides it again', async ({ page }) => {
    const name = `Test tile ${stamp}`;
    await page.goto('/admin/catalogue/products/new');
    await page.locator('input[name=name]').fill(name);
    await page.getByLabel('Category').selectOption({ label: 'Ceramic and porcelain tiles' });
    await page.getByLabel('One-line summary').fill('A test porcelain tile for the end-to-end run.');
    await page.getByLabel('Status').selectOption('PUBLISHED');
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page.getByRole('heading', { name: /Sizes and options/ })).toBeVisible();
    await page.getByText('Add a size or option').click();
    await page.getByLabel('Size or option').fill('600 × 600 mm');
    await page.getByLabel('SKU (optional)').fill(`T-${stamp}`);
    await page.getByLabel('Unit').fill('carton');
    await page.getByLabel(/Price book value/).fill('18,500');
    await page.getByRole('button', { name: 'Add size' }).click();
    await expect(page.getByText('600 × 600 mm').first()).toBeVisible();
    const adminUrl = page.url();

    // a visitor sees the size and unit, never the price
    const visitor = await page.context().browser()!.newContext();
    const v = await visitor.newPage();
    await v.goto('/search?q=' + encodeURIComponent(name));
    await v.getByRole('link', { name: new RegExp(name) }).first().click();
    await expect(v.getByRole('heading', { level: 1 })).toHaveText(name);
    await expect(v.getByRole('cell', { name: '600 × 600 mm' })).toBeVisible();
    await expect(v.getByLabel('Quantity (carton)')).toBeVisible();
    const body = await v.locator('body').innerText();
    expect(body).not.toContain('18,500');
    expect(body).not.toContain('₦');
    const productPath = new URL(v.url()).pathname;

    // taking it back to draft removes it from the public site
    await page.goto(adminUrl);
    await page.getByLabel('Status').selectOption('DRAFT');
    await page.getByRole('button', { name: 'Save product' }).click();
    await expect(page.getByText(/saved/i).first()).toBeVisible();
    expect((await v.goto(productPath))?.status()).toBe(404);
    await visitor.close();
  });

  test('catalogue CSV: export has the documented columns, and an import creates a draft needing review', async ({ page }) => {
    const res = await page.request.get('/admin/catalogue/export');
    expect(res.headers()['content-type']).toContain('text/csv');
    const text = await res.text();
    expect(text.split(/\r?\n/)[0]).toBe('category,product,summary,brand,size,sku,unit,price,availability,status');
    expect(text).toContain('Vertical water storage tank, black');

    const csv = `category,product,summary,size,sku,unit,price\nBuilding materials and construction supplies,Imported cement ${stamp},Imported by the e2e run,50 kg bag,CEM-${stamp},bag,"9,500"\n`;
    await page.goto('/admin/catalogue');
    await page.locator('input[type=file][name=file]').setInputFiles({ name: 'catalogue.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByText(/Imported: 1 new product/).first()).toBeVisible();
    await page.goto(`/admin/catalogue?q=${stamp}`);
    const row = page.getByRole('table', { name: 'Products' }).getByRole('row', { name: new RegExp(`Imported cement ${stamp}`) });
    await expect(row).toContainText('Draft');
  });

  test('a staff user can be created from the Users page', async ({ page }) => {
    await page.goto('/admin/users');
    const email = `new.staff.${stamp}@example.test`;
    await page.getByLabel('Full name').fill('New Staff Member');
    await page.getByLabel('Work email').fill(email);
    await page.getByLabel('Role', { exact: true }).selectOption('COMMERCIAL');
    await page.getByRole('button', { name: 'Create and email invitation' }).click();
    await expect(page.getByText('User created.')).toBeVisible();
    await page.reload();
    await expect(page.getByText(email)).toBeVisible();
    // the invitation is in the outbox, with no password in it
    await page.goto('/admin/notifications');
    await expect(page.getByText('Your St. Chris Materials Desk account').first()).toBeVisible();
  });
});
