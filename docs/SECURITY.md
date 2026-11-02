# Security notes

## What is in place (and tested where marked ✔)

| Area | Measure |
|---|---|
| Authorisation | Role permissions and row-level scopes enforced in the service layer; direct URL/ID guessing returns *not found* ✔ (integration + browser tests) |
| Passwords | bcrypt (cost 12); policy ≥ 10 characters with letters and numbers; no password is ever emailed ✔ |
| Sign-in | Same message for unknown user and wrong password; lock after 8 failures (15 min); per-address and per-account throttling; staff and customers use separate sign-in pages ✔ |
| Sessions | Random token in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie (whenever `APP_URL` is `https://`); only a SHA-256 hash is stored; 12 h staff / 14 d customers; ended on password reset, role change, deactivation ✔ |
| Reset and verification links | Single-use, hashed in the database, 1 hour (password reset), 48 hours (email verification), 72 hours (staff invitation); address enumeration avoided; delivered emails have the link stripped from the stored copy after an hour ✔ |
| Forms | zod validation on the server for every action; honeypot field; consent required; server actions are origin-checked by Next.js ✔ |
| Uploads | Allow-list of types, 10 MB × 5, file-signature check, random storage names, outside the web root, `attachment` + `nosniff` on download, signed per-user links (5 minutes) plus a fresh access check ✔ |
| Money | Server-side exact arithmetic; browser totals ignored ✔ |
| Quotation integrity | Immutable submitted revisions; no self-approval; approval limits; conditional update stops double acceptance ✔ |
| Rate limits | Request submission, sign-in, sign-up, password reset — stored in PostgreSQL ✔ |
| Output | React escaping; admin Markdown sanitised (scripts, handlers, `javascript:` removed) ✔; CSV formula neutralisation ✔ |
| Script policy | Strict nonce-based CSP set per request in `src/proxy.ts`: `script-src 'self' 'nonce-…' 'strict-dynamic'`, no `unsafe-inline` or `unsafe-eval` in production, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. Checked in a browser: no violations on the public site, portal or console ✔ |
| Staff two-factor sign-in | TOTP (RFC 6238, authenticator app) with ten single-use recovery codes stored hashed; secret stored encrypted; each code works once; a failed code limit applies to the challenge; a Super Admin can reset a colleague; a Super Admin can make it **mandatory for all staff** in Settings → Security ✔ |
| Upload scanning | Every upload is scanned before it is served. Built-in checks always run (EICAR signature, executables, macro and PDF-launch payloads, zip bombs); with `CLAMAV_HOST` set, files are also streamed to a ClamAV daemon. Infected files are rejected; if ClamAV is configured but unreachable, files are **held** and re-scanned by the maintenance job, never served unscanned ✔ |
| Headers | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production ✔ |
| Secrets | Environment only; integration secrets AES-256-GCM encrypted in the database; never returned to the browser or logged ✔ |
| Outbound requests | Every connector (email APIs, SMS, WhatsApp, webhook, CRM and the other REST connectors) goes through one function: `https://` only, no embedded credentials, no private, loopback, link-local (cloud metadata) or reserved addresses, redirects not followed, timeout and response-size cap ✔ |
| Analytics and cookies | Off unless a Super Admin switches it on. Even then nothing loads until the visitor presses Accept; never on `/admin` or `/portal`; not loaded when the browser sends Do Not Track or Global Privacy Control ✔ |
| Customer messaging | SMS and WhatsApp go only to customers who ticked the box on that request; messages carry the reference and status only; phone numbers are masked in logs ✔ |
| Audit | Security-relevant actions recorded with actor and time ✔ |
| Privacy | Customer contact details are used only for the request; confirmation pages need an unguessable token; no third-party scripts, fonts or trackers unless analytics is switched on and accepted |

## Known limitations — decide before or soon after go-live

1. **Two-factor sign-in is optional until a Super Admin makes it mandatory.** The default setting is off so the first administrator can get in; turn on *Settings → Security → require two-factor for all staff* once each person has enrolled. Recovery depends on the recovery codes or a Super Admin reset: keep at least two Super Admins.
2. **ClamAV is not bundled.** Without `CLAMAV_HOST` only the built-in checks run. They catch obvious abuse and the EICAR test file, but they are not an antivirus engine. Run a ClamAV daemon (for example the `clamav/clamav` image) and set `CLAMAV_HOST` for a real virus scan. Not tested against a live ClamAV daemon in this environment: the protocol is tested against a mock `clamd`.
3. **Connector DNS rebinding.** An address is resolved and checked, then fetched; a hostile DNS server could answer differently the second time. Only Super Admins can set connector URLs. For stricter control, pin the resolved address or restrict egress at the network layer.
4. **Analytics hosts in the CSP are fixed** (Plausible at plausible.io and Google Analytics). A self-hosted Plausible or another tool needs its host added to `ANALYTICS_EXTRA_HOSTS` and a code change to load it.
5. **Connectors are tested against mock servers, not live providers.** The requests are checked for the documented shape, but a provider can change its API or reject an account for reasons only a live test shows. Use each connector's test button with real credentials before relying on it.
6. **Single-server file storage.** Files are on local disk; for several app servers use shared storage or an object store (code change in `src/server/storage.ts`).
7. **Rate limiting trusts the address the proxy reports** when `TRUST_PROXY=true`. Make sure your proxy overwrites `X-Forwarded-For`.
8. **No penetration test** has been performed. This document describes design and automated tests, not an external assessment.
9. **Data protection.** Retention periods, the privacy notice and the terms are drafts and need review by St. Chris’s legal adviser (Nigeria Data Protection Act 2023). No automated deletion/retention job exists; personal data is kept until removed by an administrator through the database.
10. **Email authentication** (SPF, DKIM, DMARC) is a DNS task outside the application.

## Reporting a problem
Decide an address/owner for security reports and add it to the contact page; none is published today.
