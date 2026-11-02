/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script */
/**
 * Builds a single self-contained HTML file that shows the running site (every page snapshot, fonts and photos inlined,
 * with a desktop / phone switch). Buttons that need the server (bag, forms, payments) do not work in the snapshot.
 *
 *   BASE=http://localhost:3000 OUT=stchris-preview.html node scripts/make-preview.cjs
 *
 * Optional, to include signed-in screens (the site must be in demo mode so there is sample content):
 *   PREVIEW_MEMBER_EMAIL / PREVIEW_MEMBER_PASSWORD   -> My Space with a sample request
 *   PREVIEW_STAFF_EMAIL  / PREVIEW_STAFF_PASSWORD    -> Studio screens (enrols an authenticator on first use; use a throwaway account)
 * If TT Firs Neue files are installed in public/fonts the snapshot uses them; otherwise it shows the fallback.
 */
const { chromium } = require('@playwright/test');
const { createHmac } = require('node:crypto');
const fs = require('node:fs');

const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.OUT || 'stchris-preview.html';

function b32(s) { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, v = 0; const o = []; for (const ch of s.replace(/[\s=]/g, '').toUpperCase()) { v = (v << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); }
function totp(secret, at = Date.now()) { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(at / 30000))); const h = createHmac('sha1', b32(secret)).update(c).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); }


const PUBLIC = [['home', 'Home', '/', 'Shop'], ['chris', 'Chris Iyoha', '/chris-iyoha', 'Chris Iyoha'], ['leadership', 'Leadership, Career & Opportunities', '/leadership', 'Chris Iyoha'], ['divisions', 'Divisions', '/divisions', 'St. Chris Global'], ['division', 'A division', '/divisions/bathroom-and-kitchen', 'St. Chris Global'], ['opps', 'Opportunities', '/opportunities', 'Opportunities'], ['journal', 'Journal', '/journal', 'Journal & Media'], ['media', 'Media centre', '/media-centre', 'Journal & Media'], ['catalogue', 'Catalogue', '/catalogue', 'Shop'], ['category', 'Water tanks', '/catalogue/water-storage-tanks', 'Shop'], ['product', 'Product', '/products/vertical-water-storage-tank-black', 'Shop'], ['search', 'Search', '/search?q=mixer', 'Shop'], ['list', 'Project list', '/list', 'Buy'], ['request', 'Send for quotation', '/request?service=materials-quotation', 'Buy'], ['services', 'Ways to buy', '/services', 'Buy'], ['about', 'About', '/about', 'Company'], ['geepee', 'GeePee partnership', '/partnerships/geepee', 'St. Chris Global'], ['how', 'How quotes work', '/how-it-works', 'Company'], ['contact', 'Contact', '/contact', 'Company'], ['privacy', 'Privacy', '/privacy', 'Company'], ['terms', 'Terms', '/terms', 'Company']];

// Runs inside the page: freeze it into plain HTML + CSS with everything inlined
async function freeze(routes) {
  const toData = async (url) => {
    try {
      const r = await fetch(url); if (!r.ok) return null; const b = await r.blob();
      return await new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); });
    } catch { return null; }
  };
  const cache = new Map();
  const data = async (u) => { if (!cache.has(u)) cache.set(u, toData(u)); return cache.get(u); };
  document.querySelectorAll('script,noscript,link[rel=preload],link[rel=modulepreload],link[rel=prefetch]').forEach((n) => n.remove());
  for (const l of [...document.querySelectorAll('link[rel=stylesheet]')]) {
    let css = await (await fetch(l.href)).text();
    const base = new URL(l.href);
    const urls = [...new Set([...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:')))];
    for (const u of urls) { const d = await data(new URL(u, base).href); if (d) css = css.split(u).join(d); }
    const s = document.createElement('style'); s.textContent = css; l.replaceWith(s);
  }
  for (const img of document.querySelectorAll('img')) {
    const src = img.currentSrc || img.src; if (!src || src.startsWith('data:')) continue;
    const d = await data(src); if (d) { img.src = d; img.removeAttribute('srcset'); img.removeAttribute('loading'); }
  }
  const s = document.createElement('style');
  s.textContent = '.rv{opacity:1!important;transform:none!important;transition:none!important}.toast,#toTop{display:none!important}';
  document.head.appendChild(s);
  for (const a of document.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href'); const path = h.split('#')[0].split('?')[0];
    a.setAttribute('data-p', Object.prototype.hasOwnProperty.call(routes, path) ? routes[path] : '');
    a.setAttribute('href', '#');
  }
  document.querySelectorAll('form').forEach((f) => f.removeAttribute('action'));
  return '<!doctype html>' + document.documentElement.outerHTML;
}

const IFRAME_JS = `<script>
document.addEventListener('click',function(e){
  var a=e.target.closest('a');
  if(a){e.preventDefault();var p=a.getAttribute('data-p');if(p)parent.postMessage({go:p},'*');return}
  var b=e.target.closest('button');if(b&&!b.closest('nav')){e.preventDefault()}
});
document.addEventListener('submit',function(e){e.preventDefault()});
<\/script>`;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
  const tabs = [];
  const routes = Object.fromEntries(PUBLIC.map(([k, , p]) => [p.split('?')[0], k]));
  routes['/catalogue/tiles'] = 'catalogue';
  async function grab(page, key, label, path, group) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(400);
    const html = await page.evaluate(freeze, routes);
    tabs.push({ key, label, group, html: html.replace('</body>', IFRAME_JS + '</body>') });
    console.log('captured', key, Math.round(html.length / 1024) + ' KB');
  }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  // a sample list so the list and request pages show real lines
  await page.goto(BASE + '/products/vertical-water-storage-tank-black');
  await page.getByLabel('Quantity').fill('3');
  await page.getByRole('button', { name: 'Add to project list' }).click();
  await page.getByRole('status').filter({ hasText: 'added' }).waitFor();
  await page.goto(BASE + '/list');
  const form = page.getByRole('form', { name: 'Add an item that is not in the catalogue' });
  await form.getByLabel('Item').fill('600 x 600 porcelain floor tile, grey');
  await form.getByLabel('Quantity').fill('120');
  await form.getByLabel('Unit').fill('carton');
  await form.getByRole('button', { name: 'Add' }).click();
  await page.getByText('added.').first().waitFor({ state: 'attached' });
  for (const [k, l, p, g] of PUBLIC) await grab(page, k, l, p, g);
  await ctx.close();
  await browser.close();

  const esc = (h) => h.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const groups = [...new Set(tabs.map((t) => t.group))];
  const shell = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>St. Chris Materials Desk: preview</title>
<style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;font:13px/1.4 system-ui,sans-serif;background:#1b1f19;color:#fff;display:flex;flex-direction:column;height:100vh}
header{display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center;padding:10px 16px;background:#12160F;border-bottom:1px solid #ffffff1f}
header b{letter-spacing:.3em;font-size:12px}.grp{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.grp small{opacity:.55;margin-right:4px;text-transform:uppercase;letter-spacing:.14em;font-size:10px}
button{border:1px solid #ffffff30;background:none;color:#fff;padding:5px 11px;font:inherit;cursor:pointer;border-radius:2px}button.on{background:#fff;color:#12160F;border-color:#fff}
.sp{margin-left:auto;display:flex;gap:4px;align-items:center}.note{padding:6px 16px;background:#8c3a0b;font-size:12px}
main{flex:1;display:flex;justify-content:center;overflow:auto;padding:0;background:#1b1f19}iframe{border:0;background:#fff;width:100%;height:100%}iframe[hidden]{display:none}main.phone{padding:16px 0}main.phone iframe{width:390px;height:calc(100% - 0px);border-radius:18px;box-shadow:0 0 0 8px #000}</style></head><body>
<header><b>ST. CHRIS</b>${groups.map((g) => `<div class="grp"><small>${g}</small>${tabs.map((t, i) => t.group === g ? `<button data-k="${t.key}" ${i === 0 ? 'class="on"' : ''}>${t.label}</button>` : '').join('')}</div>`).join('')}
<div class="sp"><button data-v="d" class="on">Desktop</button><button data-v="p">Phone</button></div></header>
<div class="note">Snapshot of the running site with sample content. Links move between the pages shown; adding to the list, forms and sign-in work only in the running app.${fs.existsSync('public/fonts/TTFirsNeue-Regular.woff2') ? '' : ' Type shown is the fallback until the TT Firs Neue files are added.'}</div>
<main id="m">${tabs.map((t, i) => `<iframe data-k="${t.key}" ${i ? 'hidden' : ''} srcdoc="${esc(t.html)}"></iframe>`).join('')}</main>
<script>
var m=document.getElementById('m');
function go(k){document.querySelectorAll('iframe').forEach(function(f){f.hidden=f.dataset.k!==k});document.querySelectorAll('button[data-k]').forEach(function(b){b.classList.toggle('on',b.dataset.k===k)})}
document.querySelectorAll('button[data-k]').forEach(function(b){b.onclick=function(){go(b.dataset.k)}});
document.querySelectorAll('button[data-v]').forEach(function(b){b.onclick=function(){m.className=b.dataset.v==='p'?'phone':'';document.querySelectorAll('button[data-v]').forEach(function(x){x.classList.toggle('on',x===b)})}});
window.addEventListener('message',function(e){if(e.data&&e.data.go)go(e.data.go)});
</script></body></html>`;
  fs.writeFileSync(OUT, shell);
  console.log('wrote', OUT, (shell.length / 1048576).toFixed(1) + ' MB');
})().catch((e) => { console.error(e); process.exit(1); });
