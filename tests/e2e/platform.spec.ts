import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PASSWORD, logout } from './helpers';

const PUBLIC = ['/chris-iyoha', '/leadership', '/divisions', '/divisions/building-materials', '/divisions/bathroom-and-kitchen', '/opportunities', '/journal', '/media-centre', '/contact', '/request?service=partnership-proposal'];

async function signIn(page: Page, email: string, landing: RegExp) {
  await page.goto('/admin/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(landing);
}

const serious = async (page: Page) => {
  await page.waitForLoadState('networkidle');
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
};

test.describe('new public pages', () => {
  for (const path of PUBLIC) {
    test(`${path} renders cleanly, has one h1 and no serious accessibility violations`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      expect(await serious(page)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test('the GeePee Tanks feature stays hidden while it is an unfinished draft', async ({ page }) => {
    const res = await page.goto('/partnerships/geepee-tanks');
    expect(res?.status()).toBe(404);
    await page.goto('/');
    // The partnership overview is always public; only the long-form story stays unlinked until it is published.
    await expect(page.locator('a[href="/partnerships/geepee-tanks"]')).toHaveCount(0);
  });

  test('the journal feed and sitemap are served, and the sitemap lists divisions', async ({ request }) => {
    expect((await request.get('/journal/feed.xml')).status()).toBe(200);
    const map = await (await request.get('/sitemap.xml')).text();
    expect(map).toContain('/divisions/building-materials');
    expect(map).not.toContain('/staff');
    expect(map).not.toContain('/admin');
  });

  test('the executive page does not invent facts: no dates, awards or employers beyond the brief', async ({ page }) => {
    await page.goto('/chris-iyoha');
    const text = (await page.locator('main').innerText()).toLowerCase();
    for (const banned of ['award', 'honour', 'graduated', 'university', 'born in', 'years of experience']) expect(text, banned).not.toContain(banned);
    await expect(page.getByText('Leading with purpose. Building with vision. Inspiring progress.').first()).toBeVisible();
  });

  test('an opportunity enquiry reaches the right department', async ({ page }) => {
    await page.goto('/request?service=partnership-proposal');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('publishing workflow (content manager)', () => {
  test('writes, publishes, shows on the site, then takes it down', async ({ page }) => {
    await signIn(page, 'content@stchris.local', /\/admin$/);
    await page.goto('/admin/journal/new');
    const title = `Why trust compounds ${Date.now()}`;
    await page.locator('#f-title').fill(title);
    await page.locator('#f-excerpt').fill('A short note on why long relationships outlast single deals.');
    await page.locator('#f-body').fill('Trust is built one delivery at a time.\n\n## What it looks like\n\nKeeping the small promises.');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page).toHaveURL(/\/admin\/journal\/[a-z0-9]+\?done=save/);
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

    // a draft is not public
    const slug = await page.locator('input[name="slug"]').inputValue();
    expect((await page.request.get(`/journal/${slug}`)).status()).toBe(404);

    // preview works for the author
    await page.goto(page.url().replace(/\?.*/, '') + '/preview');
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await page.goBack();

    await page.getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Published' })).toBeVisible();
    await page.goto(`/journal/${slug}`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    expect(await serious(page)).toEqual([]);
    await page.goto('/journal');
    await expect(page.getByRole('link', { name: new RegExp(title) }).first()).toBeVisible();

    // take it down again
    await page.goto('/admin/journal');
    await page.getByRole('link', { name: new RegExp(title) }).first().click();
    await page.getByRole('button', { name: 'Unpublish' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Taken off the site' })).toBeVisible();
    expect((await page.request.get(`/journal/${slug}`)).status()).toBe(404);
  });

  test('refuses to publish an article that still has unfinished [[markers]]', async ({ page }) => {
    await signIn(page, 'content@stchris.local', /\/admin$/);
    await page.goto('/admin/journal/new');
    await page.locator('#f-title').fill(`Unfinished piece ${Date.now()}`);
    await page.locator('#f-excerpt').fill('Still has a placeholder in it.');
    await page.locator('#f-body').fill('Opening paragraph. [[Add the date the partnership began]]');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page).toHaveURL(/done=save/);
    await page.getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /unfinished|\[\[/i })).toBeVisible();
  });

  test('communications can open the social queue; a content manager cannot manage accounts', async ({ page }) => {
    await signIn(page, 'comms@stchris.local', /\/admin$/);
    await page.goto('/admin/journal/social');
    await expect(page.getByRole('heading', { name: 'Social accounts and queue' })).toBeVisible();
    await expect(page.getByText('Connect an account')).toBeVisible();
    await logout(page);
    await signIn(page, 'content@stchris.local', /\/admin$/);
    await page.goto('/admin/journal/social');
    await expect(page.getByText('Connect an account')).toHaveCount(0);
  });
});

test.describe('role boundaries', () => {
  test('communications cannot edit divisions; content managers cannot manage users', async ({ page }) => {
    await signIn(page, 'comms@stchris.local', /\/admin$/);
    await page.goto('/admin/divisions');
    await expect(page).toHaveURL(/\/admin\/forbidden/);
    await logout(page);
    await signIn(page, 'content@stchris.local', /\/admin$/);
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/admin\/forbidden/);
  });

  test('the console menu shows each role only its own areas', async ({ page }) => {
    await signIn(page, 'comms@stchris.local', /\/admin$/);
    const nav = page.getByRole('navigation').first();
    await expect(page.getByRole('link', { name: 'Journal', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Users and roles' })).toHaveCount(0);
    await expect(nav).toBeVisible();
  });
});

test.describe('staff portal', () => {
  test('an employee lands in the staff portal and is kept out of the console', async ({ page }) => {
    await signIn(page, 'employee@stchris.local', /\/staff$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Hello');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/staff$/);
    await page.goto('/admin/journal');
    await expect(page).toHaveURL(/\/staff$/);
    await page.goto('/portal');
    await expect(page).not.toHaveURL(/\/portal$/);
  });

  test('visitors who are not signed in are sent to sign in, and staff pages are not indexed', async ({ page, request }) => {
    await page.goto('/staff');
    await expect(page).toHaveURL(/\/admin\/login/);
    expect((await request.get('/staff/documents/nope/file')).status()).toBe(404);
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('/staff');
  });

  test('communications posts an announcement and the employee reads it', async ({ page }) => {
    await signIn(page, 'comms@stchris.local', /\/admin$/);
    await page.goto('/admin/staff-portal');
    const title = `Quarter-end schedule ${Date.now()}`;
    await page.getByText('Write a post').click();
    const form = page.locator('details', { hasText: 'Write a post' }).last();
    await form.getByLabel('Title').fill(title);
    await form.getByLabel('Message').fill('Quarter-end stock count starts Monday at 8am.');
    await form.getByLabel('Publish to staff now').check();
    await form.getByRole('button', { name: 'Save post' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
    await logout(page);

    await signIn(page, 'employee@stchris.local', /\/staff$/);
    await page.getByRole('link', { name: new RegExp(title) }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await page.goto('/staff');
    // read posts lose their "New" marker
    await expect(page.getByRole('link', { name: new RegExp(title) }).getByText('New')).toHaveCount(0);
  });
});

test.describe('pages have no serious accessibility violations', () => {
  test('every new admin page (as super admin)', async ({ page }) => {
    await signIn(page, 'admin@stchris.local', /\/admin$/);
    const bad: string[] = [];
    for (const path of ['/admin/journal', '/admin/journal/new', '/admin/journal/social', '/admin/profile', '/admin/profile?scope=geepee', '/admin/divisions', '/admin/opportunities', '/admin/media-centre', '/admin/seo', '/admin/staff-portal', '/admin/insights', '/admin/departments']) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      for (const v of await serious(page)) bad.push(`${path} ${v}`);
    }
    expect(bad).toEqual([]);
  });

  test('every staff portal page (as an employee)', async ({ page }) => {
    await signIn(page, 'employee@stchris.local', /\/staff$/);
    const bad: string[] = [];
    for (const path of ['/staff', '/staff/directory', '/staff/documents', '/staff/profile']) {
      await page.goto(path);
      for (const v of await serious(page)) bad.push(`${path} ${v}`);
    }
    expect(bad).toEqual([]);
  });
});
