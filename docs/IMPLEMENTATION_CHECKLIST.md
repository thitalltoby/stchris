# Implementation checklist

Status key — **T** implemented and tested · **I** implemented but testing incomplete · **C** awaiting credentials · **B** blocked by a business decision · **N** not implemented.

"Tested" means an automated test exercises it: unit and integration tests against a real PostgreSQL database (272 tests, 21 files), or a real Chromium browser against a production build (64 tests, 6 files, desktop and a Pixel 7 profile). Nothing here has been tested on real phones, in Firefox or Safari, with a screen reader, under load, or against a live email, SMS or integration provider.

## 1. Public site

| Requirement | Status | Evidence / note |
|---|---|---|
| Home, catalogue, category, product, search, services (7 request types), About, Sweethome, How quotations work, Contact, Privacy, Terms, sign-in/up pages | **T** | Every page renders with no console errors and exactly one `h1` (browser) |
| Site's own 404 and error pages | **T** | Unknown product, category and unmatched paths return 404 with a way back (browser) |
| Catalogue: 11 categories, products, sizes, search over names, summaries, brands and SKUs | **T** | Integration and browser tests. Only 3 products exist until staff add more (see D7) |
| Internal price book never public | **T** | Integration test over every public read; browser test searches pages for `₦` |
| Project list (server-side, survives reload, merges into the account at sign-in, 150-line cap) | **T** | Integration and browser tests |
| Responsive layout | **I** | No sideways scrolling on 13 pages at Pixel 7 size; tap-target checks. Not checked on real devices |
| Accessibility (WCAG 2.2 AA intent) | **I** | axe-core: no serious or critical findings on 8 key pages. No manual or screen-reader pass |
| Brand: logo, orange palette, TT Firs Neue (licensed, **not bundled**; Figtree/IBM Plex fallback) | **B** | Implemented from the supplied logo; font files and brand guidelines outstanding |
| Claims limited to supplied material, hedged and flagged | **B** | `docs/CONTENT_REGISTER.md` |
| Contact details | **B** | None supplied, so none shown |
| SEO basics: titles, descriptions, sitemap, robots | **T** | Sitemap lists catalogue and product pages and excludes private areas. No structured data |
| Analytics | **C** | Built (Plausible/GA4, consent first); off until configured |

## 2. Request builder

| Requirement | Status | Evidence / note |
|---|---|---|
| Steps: how you are buying → check your list → details → about you → review → send | **T** | Browser journey and mobile test |
| Configurable request types and fields | **T** | Service-layer tests; editor in the console |
| Catalogue lines rebuilt from the database, not from the browser; unpublished product refused | **T** | Integration tests (tampered label and unit ignored) |
| A request type that carries a list refuses an empty one | **T** | Integration and browser |
| Server-side validation, unique reference (`SCG-YYYY-NNNNN`), idempotency, rate limit, honeypot | **T** | Including concurrent submission and double-click |
| File upload: type, size, count, signature check, private storage | **T** | |
| Confirmation page (token protected) with items and "not an order" statement | **T** | |
| Draft kept while the tab is open | **I** | Implemented; restore after reload not asserted |
| Customer and staff notifications | **C** | Queued, retried and logged (**T**); delivery needs an email provider |

## 3. Customer portal

| Requirement | Status | Evidence / note |
|---|---|---|
| Register, verify email, sign in, reset password, colleague invitation | **T** | |
| Request history, items asked for, timeline, answering information requests | **T** | Browser journey |
| Reorder: copy an earlier request back onto a new list | **T** | Integration (removed products stay as described lines) and browser |
| Quotation: review, download PDF, accept (authority box) or decline (reason); cannot be answered twice | **T** | |

## 4. Staff console

| Requirement | Status | Evidence / note |
|---|---|---|
| Roles and server-enforced permissions, row scoping | **T** | Unit matrix, integration and browser |
| Requests: list, detail with items requested, assignment, status rules, information requests, tasks, notes | **T** | |
| Quotation starts from the request's items and the price book; unpriced lines flagged; revisions; approval; issue; PDF | **T** | Browser journey asserts the prefill and the warning |
| Offline acceptance recording | **T** | |
| Catalogue management: categories, products, sizes, brands, photos, status | **T** | Integration; browser creates a priced product and takes it back to draft |
| Catalogue CSV import and export (formula-injection safe, nothing deleted) | **T** | Integration and browser |
| Request types and field editor, "carries a project list" tick | **T** | |
| Company pages, FAQs, facts register, photo library | **T** | |
| Customers / companies / contacts (lightweight CRM) | **T** | No company merge tool (D11) |
| Reports and CSV export, dashboard | **T** | Small-sample rule tested |
| Users, invitations, last Super Admin protection, staff two-factor | **T** | |
| Settings, announcement, registration number | **T** | |
| Integrations (email, SMS, WhatsApp, analytics, webhook, CRM, accounting, delivery and dispatch, stock, documents) | **T** / **C** | Framework, mappings, retries and logs tested with a fake server; none run against a live provider |
| Notification outbox, audit log, upload scanning | **T** | ClamAV needs a daemon (**C**) |

## 5. Not built

| Item | Status |
|---|---|
| Online payment, order tracking, stock levels, delivery scheduling | **N** (deliberately: a quotation is accepted, not paid) |
| Negotiated trade price lists per account | **N** (A8) |
| Product filters, full-text ranking | **N** (D9, D10) |
| Live chat, newsletter, maps, social feeds | **N** |

## 6. Test inventory

- **Unit** (7 files): money, notice, permissions, security helpers, TOTP, validation, workflow.
- **Integration** (11 files): requests, quotations, offline acceptance, CRM and portal, platform, MFA, connectors, scanning, media library and company pages, **catalogue**, **project list**.
- **Browser** (6 files): public pages, axe, 404, headers and sitemap; the full list-to-accepted-quotation journey with permissions; admin editing and catalogue CSV; integrations console and public effects; staff two-factor; mobile.

## 9. Executive platform (brief of 31 Oct 2026)

Browser tests: 90 (desktop Chromium and a Pixel 7 profile), including axe on every new public, admin and staff page.

| Requirement | Status | Evidence / note |
|---|---|---|
| Editorial redesign (serif/sans pairing, whitespace, restrained motion that respects reduced-motion, mobile-first) | **I** | Visual review of home, profile, divisions, journal and the phone editor; axe and no-sideways-scroll tests. No real-device review |
| Chris Iyoha profile + Leadership, Career & Opportunities | **B** | Built and editable. **Copy is a stand-in written from the brief** (original biography text was not recoverable); no invented facts, tested. Needs the approved biography |
| Six divisions with own pages, categories and enquiry | **T** | Integration (permissions, validation) and browser tests. Descriptions flagged for review |
| Opportunities (partnership, distribution, supplier, procurement, investment, careers) with forms | **T** | Published/open filtering tested; enquiries use the request engine and route to departments |
| GeePee Tanks feature | **B** | Guarded draft with `[[…]]` markers; cannot publish until facts are supplied. Tested that it is hidden |
| Mobile-first journal: draft, schedule, publish, edit, remove, photos, video links, categories (8), tags, SEO, preview | **T** | Integration (29 journal/social tests) and browser tests including write-and-publish on a Pixel 7 profile |
| Social publishing: LinkedIn, Facebook, Instagram, X; per-post channel choice; per-platform captions, hashtags, link rules | **C** | Tested against simulated platform servers only (success, bad token, rate limit, outage, rejection, retries). **Never run against live platforms** |
| Unsupported formats / failures → manual workflow, no false promises | **T** | `NEEDS_MANUAL` with plain-words reason, copy-ready text, team email, mark-as-posted |
| Media centre (press, interviews, speaking, announcements, commentary, mentions, galleries) | **T** | Validation and permission tests; empty until staff add items |
| Customer engagement: enquiries, RFQ, procurement, partnership applications, department routing, email notification, history, WhatsApp | **T / C** | Routing and storage tested. Email and WhatsApp numbers need credentials/values |
| Staff portal with role-based access (posts, circulars, directory, documents, profiles) | **T** | Integration and browser tests, including department scoping, read tracking, customer and employee boundaries |
| Admin dashboard: profile, content, products, journal, media, social accounts and log, leads, partnerships, staff and roles, analytics | **T** | Role-based menus; browser axe tests |
| Roles: super admin, content manager, communications, other staff | **T** | Permission matrix tests |
| GA4, Search Console, SEO management, share metadata, clean URLs, conversion events, readership analytics | **C** | Built; need St. Chris's IDs. Not verified against live Google services |
| Social performance metrics | **N** | Not collected (see `OUTSTANDING_ITEMS.md` F6) |
| Backup/recovery, monitoring, integration-ready architecture | **I** | Documented; monitoring service not chosen (F10) |
