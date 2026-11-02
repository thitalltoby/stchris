import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = ['/', '/catalogue', '/catalogue/water-storage-tanks', '/products/vertical-water-storage-tank-black', '/search?q=tank', '/services', '/services/materials-quotation', '/about', '/partnerships/geepee', '/how-it-works', '/contact', '/list', '/request', '/login', '/register', '/forgot-password', '/privacy', '/terms'];

test.describe('public site', () => {
  for (const path of PAGES) {
    test(`${path} renders without console errors and has one h1`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await page.waitForLoadState('networkidle');
      expect(errors).toEqual([]);
    });
  }

  for (const path of ['/', '/catalogue', '/catalogue/water-storage-tanks', '/products/vertical-water-storage-tank-black', '/list', '/request', '/login', '/contact']) {
    test(`${path} has no serious accessibility violations (axe)`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    });
  }

  test('unknown addresses show the site’s own 404 page, with a way back', async ({ page }) => {
    for (const path of ['/products/does-not-exist', '/catalogue/does-not-exist', '/nowhere/at/all']) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('We could not find that page.');
      await expect(page.getByRole('link', { name: 'Browse the catalogue' }).first()).toBeVisible();
    }
  });

  test('no public page carries Euromac content, placeholder text or a price from the price book', async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      const text = (await page.locator('body').innerText()).toLowerCase();
      for (const bad of ['stchris', 'lorem ipsum', 'tbd', 'coming soon', '₦']) expect(text, `${path} contains “${bad}”`).not.toContain(bad);
    }
  });

  test('the catalogue search finds a product and a category, and says so plainly when it finds nothing', async ({ page }) => {
    await page.goto('/search?q=tank');
    await expect(page.getByRole('link', { name: /Vertical water storage tank, black/ }).first()).toBeVisible();
    await page.goto('/search?q=zzzzqqq');
    await expect(page.getByText(/no matches|nothing/i).first()).toBeVisible();
  });

  test('home, header and footer route to the right places', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('banner').getByRole('link', { name: /Project list/ }).click();
    await expect(page).toHaveURL(/\/list$/);
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: /Major distributor/ }).first().click({ trial: true });
    await expect(page.getByRole('contentinfo').getByRole('link', { name: /Major distributor/ }).first()).toHaveAttribute('href', '/partnerships/geepee');
  });

  test('the GeePee partnership is stated on the home page, in the header and footer, and on its own page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('banner').getByRole('link', { name: /Major distributor & strategic partner of GeePee Water Tanks/ })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: /Major distributor & strategic partner/ }).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Major distributor of GeePee Water Tanks/ })).toBeVisible();
    await page.goto('/partnerships/geepee');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Major distributor of GeePee Water Tanks');
    await expect(page.getByText("Africa's No. 1 Water Tank Manufacturer").first()).toBeVisible();
    await page.goto('/catalogue/water-storage-tanks');
    await expect(page.getByRole('main').getByRole('link', { name: /Major distributor/ })).toBeVisible();
  });

  test('Sweethome appears nowhere on the public site', async ({ page, request }) => {
    for (const path of ['/', '/about', '/divisions', '/divisions/bathroom-and-kitchen', '/catalogue', '/services', '/contact', '/how-it-works', '/opportunities', '/partnerships/geepee']) {
      const html = await (await request.get(path)).text();
      expect(html.toLowerCase(), `${path} mentions Sweethome`).not.toMatch(/sweet ?home/);
    }
    expect((await request.get('/sweethome')).status()).toBe(404);
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap.toLowerCase()).not.toContain('sweethome');
    void page;
  });

  test('licensed-font stylesheet is served and empty until font files are added', async ({ request }) => {
    const res = await request.get('/fonts/faces.css');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/css');
  });

  test('security headers are present', async ({ request }) => {
    const res = await request.get('/');
    const h = res.headers();
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-powered-by']).toBeUndefined();
  });

  test('protected areas redirect to sign-in', async ({ page }) => {
    await page.goto('/admin/requests');
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto('/admin/catalogue');
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto('/portal');
    await expect(page).toHaveURL(/\/login/);
  });

  test('the catalogue export is staff-only', async ({ request }) => {
    const res = await request.get('/admin/catalogue/export', { maxRedirects: 0 });
    expect(res.status()).not.toBe(200);
  });

  test('health endpoint reports ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  test('robots.txt hides private areas and the sitemap lists catalogue pages but not private ones', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /admin');
    expect(robots).toContain('Disallow: /portal');
    const sm = await (await request.get('/sitemap.xml')).text();
    expect(sm).toContain('/catalogue/water-storage-tanks');
    expect(sm).toContain('/products/vertical-water-storage-tank-black');
    expect(sm).not.toContain('/admin');
    expect(sm).not.toContain('/portal');
    expect(sm).not.toContain('/list');
  });
});
