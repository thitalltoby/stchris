import { test, expect } from '@playwright/test';
import { addTank, buildRequest } from './helpers';

test.describe('mobile (Pixel 7)', () => {
  test('the redesigned public pages do not scroll sideways', async ({ page }) => {
    for (const path of ['/chris-iyoha', '/leadership', '/divisions', '/divisions/building-materials', '/opportunities', '/journal', '/media-centre', '/contact']) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(1);
    }
  });

  test('the article editor is usable one-handed on a phone: no sideways scroll, big buttons, publish works', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Work email').fill('content@stchris.local');
    await page.getByLabel('Password').fill('DevPassword-123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/journal/new');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const small = await page.evaluate(() => [...document.querySelectorAll('[role="group"][aria-label="Actions"] button, [role="toolbar"] button')]
      .map((el) => { const r = el.getBoundingClientRect(); return { t: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 20), h: Math.round(r.height), w: Math.round(r.width) }; })
      .filter((x) => x.w > 0 && (x.h < 44 || x.w < 44)));
    expect(small).toEqual([]);
    const title = `Phone post ${Date.now()}`;
    await page.locator('#f-title').fill(title);
    await page.locator('#f-excerpt').fill('Written and published from a phone.');
    await page.locator('#f-body').fill('Written on the move, between two site visits. Good partnerships are kept alive by small, regular acts: answering quickly, delivering what was promised, and telling the truth early when something changes.');
    await page.getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Published' })).toBeVisible();
  });

  test('pages do not scroll sideways', async ({ page }) => {
    for (const path of ['/', '/catalogue', '/catalogue/water-storage-tanks', '/products/vertical-water-storage-tank-black', '/list', '/request', '/services', '/about', '/partnerships/geepee', '/how-it-works', '/contact', '/login', '/nowhere']) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(1);
    }
  });

  test('the menu expands groups, links work, and it closes after navigating', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const menu = page.getByRole('navigation', { name: 'Main menu' });
    await expect(menu).toBeVisible();
    // groups start collapsed; expanding shows the parent "Go to:" row first
    await expect(menu.getByRole('link', { name: 'Go to: St. Chris Global' })).toBeHidden();
    await menu.getByRole('button', { name: 'St. Chris Global' }).click();
    await expect(menu.getByRole('link', { name: 'Go to: St. Chris Global' })).toBeVisible();
    // second-level groups open with their parent
    await expect(menu.getByRole('link', { name: 'Go to: Catalogue' })).toBeVisible();
    await menu.getByRole('link', { name: 'Water storage tanks' }).click();
    await expect(page).toHaveURL(/\/catalogue\/water-storage-tanks$/);
    await expect(menu).toBeHidden();
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(menu.getByRole('link', { name: /^Project list/ })).toBeVisible();
  });

  test('a list can be built and sent from a phone', async ({ page }) => {
    await addTank(page, '2');
    await buildRequest(page, { name: 'Mobile Tester', email: `mobile.${Date.now()}@example.test`, phone: '+234 800 000 0002', company: 'Mobile Co' });
    await page.getByLabel(/I have read the/).check();
    await page.getByRole('button', { name: 'Send for quotation' }).click();
    await expect(page).toHaveURL(/\/request\/confirmation\/SCG-/);
  });

  test('tap targets in the builder are at least 24px', async ({ page }) => {
    await page.goto('/request');
    const small = await page.evaluate(() => [...document.querySelectorAll('main button, main input:not([type=hidden]), main select, main a:not(p a)')]
      .map((el) => { const r = el.getBoundingClientRect(); return { t: el.tagName + ':' + (el.getAttribute('name') ?? el.textContent?.trim().slice(0, 20)), w: r.width, h: r.height }; })
      .filter((x) => x.w > 0 && (x.h < 24 || x.w < 24) && !x.t.startsWith('INPUT:service')));
    expect(small).toEqual([]);
  });

  test('primary touch controls are at least 40px', async ({ page }) => {
    for (const path of ['/', '/catalogue', '/products/vertical-water-storage-tank-black']) {
      await page.goto(path);
      const small = await page.evaluate(() => [...document.querySelectorAll('header .btn, main .btn, main .link-arrow, footer a:not(p a)')]
        .map((el) => { const r = el.getBoundingClientRect(); return { t: (el.textContent ?? '').trim().slice(0, 24), h: Math.round(r.height), w: Math.round(r.width) }; })
        .filter((x) => x.w > 0 && x.h < 40));
      expect(small, path).toEqual([]);
    }
  });
});
