import { test, expect, type Page } from '@playwright/test';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loginStaff, STAFF } from './helpers';

// Sign in once for the whole file: the sign-in throttle (10 per account per 15 minutes) is shared with the other specs
const STATE = path.join(tmpdir(), 'stchris-e2e-admin-state.json');

async function card(page: Page, name: string) {
  await page.goto('/admin/integrations');
  return page.getByRole('region', { name, exact: true });
}

test.describe('integrations console and the public effects of connectors', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } }); // test.use below would otherwise make this read the file it is about to create
    const p = await ctx.newPage();
    await loginStaff(p, STAFF.admin);
    await ctx.storageState({ path: STATE });
    await ctx.close();
  });
  test.use({ storageState: STATE });

  test('lists every connector in groups, each with its verification statement', async ({ page }) => {
    await page.goto('/admin/integrations');
    for (const g of ['Email', 'Customer messages', 'Website', 'Business systems']) await expect(page.getByRole('heading', { name: g, exact: true })).toBeVisible();
    for (const n of ['Email delivery', 'SMS', 'WhatsApp', 'Analytics', 'Outbound webhook', 'CRM', 'Accounting and invoicing', 'Delivery and dispatch', 'Stock and inventory', 'Document management']) {
      await expect(page.getByRole('region', { name: n, exact: true }), n).toBeVisible();
    }
    // nothing claims to be verified before a test has passed
    await expect(page.getByText('On, last test passed')).toHaveCount(0);
    await expect(page.getByText(/Not yet verified|not been connected to any specific vendor/).first()).toBeVisible();
  });

  test('a bad analytics identifier is refused, and nothing is enabled', async ({ page }) => {
    const c = await card(page, 'Analytics');
    await c.getByLabel('Tool').selectOption('ga4');
    await c.getByLabel(/Domain \(Plausible\)/).fill('UA-123');
    await c.getByLabel('Switched on').check();
    await c.getByRole('button', { name: 'Save' }).click();
    await expect(c.getByText(/measurement ID such as G-/)).toBeVisible();
  });

  test('analytics: off by default; once enabled, nothing loads until the visitor accepts, and a decline is remembered', async ({ page, browser }) => {
    // switch it on
    const c = await card(page, 'Analytics');
    await c.getByLabel('Tool').selectOption('plausible');
    await c.getByLabel(/Domain \(Plausible\)/).fill('stchris.example');
    await c.getByLabel('Switched on').check();
    await c.getByRole('button', { name: 'Save' }).click();
    await expect(c.getByText('Saved.')).toBeVisible();

    try {
      // a fresh visitor
      const visitor = await browser.newContext();
      const p = await visitor.newPage();
      const analyticsRequests: string[] = [];
      const violations: string[] = [];
      await p.route(/plausible\.io\/.*/, (r) => { analyticsRequests.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stub */' }); });
      p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text()); });
      await p.goto('/');
      const banner = p.getByRole('region', { name: 'Cookie notice' });
      await expect(banner).toBeVisible();
      expect(analyticsRequests, 'nothing is requested before consent').toEqual([]);
      await banner.getByRole('button', { name: 'Decline' }).click();
      await expect(banner).toBeHidden();
      await p.reload();
      await expect(p.getByRole('region', { name: 'Cookie notice' })).toHaveCount(0);
      expect(analyticsRequests).toEqual([]);
      // changing their mind through the footer
      await p.getByRole('button', { name: 'Cookie settings' }).click();
      await p.getByRole('region', { name: 'Cookie notice' }).getByRole('button', { name: 'Accept' }).click();
      await expect.poll(() => analyticsRequests.length).toBeGreaterThan(0);
      await expect(p.locator('script[data-stchris-analytics="plausible"]')).toHaveAttribute('data-domain', 'stchris.example');
      expect(violations, 'the script policy allows the analytics script').toEqual([]);
      // the console and portal never get it
      await p.goto('/admin/login');
      await expect(p.locator('script[data-stchris-analytics]')).toHaveCount(0);
      await visitor.close();

      // a browser that sends Do Not Track is never asked
      const dnt = await browser.newContext({ extraHTTPHeaders: { DNT: '1' } });
      const q = await dnt.newPage();
      await q.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' }));
      await q.goto('/');
      await expect(q.getByRole('region', { name: 'Cookie notice' })).toHaveCount(0);
      await dnt.close();
    } finally {
      const again = await card(page, 'Analytics');
      await again.getByLabel('Switched on').uncheck();
      await again.getByRole('button', { name: 'Save' }).click();
      await expect(again.getByText('Saved.')).toBeVisible();
    }
  });

  test('the SMS opt-in box appears on the request form only while SMS is switched on', async ({ page, browser }) => {
    const openDetailsStep = async (visitor: Page) => {
      await visitor.addInitScript(() => { try { sessionStorage.removeItem('stchris-request-draft'); } catch { /* ignore */ } });
      await visitor.goto('/request');
      await visitor.getByRole('radio', { name: /Source something specific/ }).check();
      await visitor.getByRole('button', { name: /Continue/ }).click();
      await visitor.getByLabel('What are you looking for?').fill('Porcelain tiles, 60 x 120 cm, grey');
      await visitor.locator('#f-quantity').fill('200');
      await visitor.getByRole('button', { name: /Continue/ }).click();
      await expect(visitor.getByRole('heading', { name: 'Your details' })).toBeVisible();
    };
    const before = await (await browser.newContext()).newPage();
    await openDetailsStep(before);
    await expect(before.getByText('Status messages (optional)')).toHaveCount(0);
    await before.context().close();

    const c = await card(page, 'SMS');
    await c.getByLabel('Provider').selectOption('termii');
    await c.getByLabel('Sender ID or number').fill('STCHRIS');
    await c.getByLabel('API key or auth token').fill('test-key');
    await c.getByLabel('Switched on').check();
    await c.getByRole('button', { name: 'Save' }).click();
    await expect(c.getByText('Saved.')).toBeVisible();
    try {
      const visitor = await (await browser.newContext()).newPage();
      await openDetailsStep(visitor);
      await expect(visitor.getByText('Status messages (optional)')).toBeVisible();
      await expect(visitor.getByLabel(/Send me SMS updates/)).not.toBeChecked();
      await expect(visitor.getByLabel(/Send me WhatsApp updates/)).toHaveCount(0);
      // the privacy notice tells people about it
      await visitor.goto('/privacy');
      await expect(visitor.getByRole('heading', { name: 'Status messages' })).toBeVisible();
      await visitor.context().close();
    } finally {
      const again = await card(page, 'SMS');
      await again.getByLabel('Switched on').uncheck();
      await again.getByRole('button', { name: 'Save' }).click();
      await expect(again.getByText('Saved.')).toBeVisible();
    }
  });

  test('an invalid REST mapping is explained, not silently accepted', async ({ page }) => {
    const c = await card(page, 'CRM');
    await c.getByLabel('API base URL', { exact: true }).fill('https://crm.example.com/api');
    await c.getByLabel('Authentication', { exact: true }).selectOption('bearer');
    await c.getByLabel('Event mappings (JSON)').fill('{ not json');
    await c.getByLabel('Switched on').check();
    await c.getByRole('button', { name: 'Save' }).click();
    await expect(c.getByText(/not valid JSON/)).toBeVisible();
  });

  test('site announcement: absent by default, an unsafe link is refused, shows on public pages, and hides after its end date', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await expect(page.getByRole('complementary', { name: 'Announcement' })).toHaveCount(0);
    const form = async () => { await page.goto('/admin/settings'); return page.getByRole('region', { name: 'Site announcement' }); };
    try {
      let f = await form();
      await f.getByLabel('Show the announcement').check();
      await f.getByLabel(/^Announcement \(up to 160/).fill('Offices close early on Friday 6 November');
      await f.getByLabel('Link (optional)').fill('javascript:alert(1)');
      await f.getByLabel('Link label').fill('Details');
      await f.getByRole('button', { name: 'Save announcement' }).click();
      await expect(f.getByText(/page on this site/).first()).toBeVisible();
      await page.goto('/');
      await expect(page.getByRole('complementary', { name: 'Announcement' })).toHaveCount(0);

      f = await form();
      await f.getByLabel('Show the announcement').check();
      await f.getByLabel(/^Announcement \(up to 160/).fill('Offices close early on Friday 6 November');
      await f.getByLabel('Link (optional)').fill('/contact');
      await f.getByLabel('Link label').fill('Contact details');
      await f.getByRole('button', { name: 'Save announcement' }).click();
      await expect(f.getByText(/showing at the top/)).toBeVisible();
      for (const path of ['/', '/services', '/about']) {
        await page.goto(path);
        const bar = page.getByRole('complementary', { name: 'Announcement' });
        await expect(bar).toContainText('Offices close early on Friday 6 November');
        await expect(bar.getByRole('link', { name: 'Contact details' })).toHaveAttribute('href', '/contact');
      }
      // it must not leak into the console
      await page.goto('/admin');
      await expect(page.getByRole('complementary', { name: 'Announcement' })).toHaveCount(0);

      f = await form();
      await f.getByLabel('Last day to show it (optional)').fill('2020-01-01');
      await f.getByRole('button', { name: 'Save announcement' }).click();
      await expect(f.getByText(/Saved/)).toBeVisible();
      await page.goto('/');
      await expect(page.getByRole('complementary', { name: 'Announcement' })).toHaveCount(0);
    } finally {
      const f = await form();
      await f.getByLabel('Show the announcement').uncheck();
      await f.getByLabel('Last day to show it (optional)').fill('');
      await f.getByRole('button', { name: 'Save announcement' }).click();
      await expect(f.getByText(/No announcement is showing/)).toBeVisible();
    }
  });

  test('company registration number: nothing shown by default; once entered it appears in the footer and on the contact page', async ({ page }) => {
    const save = async (value: string) => {
      await page.goto('/admin/settings');
      const f = page.getByRole('region', { name: 'Company details' });
      await f.getByLabel('Company registration number (optional)').fill(value);
      await f.getByRole('button', { name: 'Save company details' }).click();
      await expect(f.getByText(/Company details saved/)).toBeVisible();
    };
    await page.goto('/contact');
    await expect(page.getByText('Company registration')).toHaveCount(0);
    try {
      await save('RC 0000000 (test value)');
      await page.goto('/contact');
      await expect(page.getByText('Company registration')).toBeVisible();
      await expect(page.locator('footer')).toContainText('RC 0000000 (test value)');
    } finally {
      await save('');
      await page.goto('/contact');
      await expect(page.getByText('Company registration')).toHaveCount(0);
    }
  });
});
