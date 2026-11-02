import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { PASSWORD, STAFF } from './helpers';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(s: string) {
  let bits = '';
  for (const ch of s.replace(/[\s=]/g, '').toUpperCase()) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
/** RFC 6238, HMAC-SHA1, 30 s step, 6 digits */
function totp(secret: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1]! & 0x0f;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}

test('staff two-factor sign-in: set up in the console, then sign-in needs the code; a recovery code turns it off', async ({ page }) => {
  // sign in the ordinary way (two-factor is not mandatory by default)
  await page.goto('/admin/login');
  await page.getByLabel('Work email').fill(STAFF.opsStaff);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto('/admin/account/security');
  await page.getByRole('button', { name: 'Set up' }).click();
  const key = (await page.locator('p.mono.select-all').innerText()).replace(/\s/g, '');
  expect(key).toMatch(/^[A-Z2-7]{16,}$/);
  const step = Math.floor(Date.now() / 30_000);
  await page.getByLabel('6-digit code').fill(totp(key, step));
  await page.getByRole('button', { name: 'Turn on two-factor sign-in' }).click();
  const banner = page.getByText('Two-factor sign-in is on.');
  await expect(banner).toBeVisible();
  const text = await page.locator('main').innerText();
  const codes = text.match(/\b[a-z2-9]{5}-[a-z2-9]{5}\b/g) ?? [];
  expect(codes.length).toBe(10);

  // a fresh browser must now pass a second step
  await page.context().clearCookies();
  await page.goto('/admin/login');
  await page.getByLabel('Work email').fill(STAFF.opsStaff);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/login\/verify/);
  await page.getByLabel(/6-digit code or recovery code/).fill('000000');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  // wait for the sign-in form's own message (the page-level route announcer is also role=alert and is always present)
  await expect(page.getByText('That code is not right or has already been used.').first()).toBeVisible();
  // the next step's code is accepted (one step of clock drift is allowed); a code that was used at set-up is not reusable
  await page.getByLabel(/6-digit code or recovery code/).fill(totp(key, step + 1));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // turn it off with the password and a recovery code (each works once)
  await page.goto('/admin/account/security');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel(/6-digit code or recovery code/).fill(codes[0]!);
  await page.getByRole('button', { name: /Turn off/ }).click();
  await expect(page.getByRole('button', { name: 'Set up' })).toBeVisible();
});
