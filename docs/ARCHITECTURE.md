# Architecture

## Shape

One Next.js application plus one worker process, one PostgreSQL database, one private file directory.

```
Browser ──► Next.js (pages, server actions, route handlers) ──► PostgreSQL
                         │                                         ▲
                         └── private files (STORAGE_DIR)           │
Worker (npm run worker) ───────── jobs, email, reminders ──────────┘
```

## Rules the code follows

1. **Authorisation is in the service layer.** Every function in `src/server/*` that reads or changes data takes the acting user and calls `assertCan(...)` and/or applies a row scope (`staffRequestScope`, `customerRequestScope`). Pages and server actions also check, but removing a button never grants or removes access. Out-of-scope records return *not found*, not *forbidden*, so identifiers cannot be probed.
2. **Roles** (`src/lib/permissions.ts`): Super Admin, Operations Admin, Operations Staff (assigned requests only), Commercial, Approver, Customer. Change the matrix there and the tests will tell you what you broke.
3. **Money is exact.** `decimal.js` for arithmetic, `NUMERIC(18,2)` in the database, each line rounded half-up before totals are summed. Totals are always recomputed on the server; whatever the browser sends is ignored.
4. **Status changes go through one function** (`applyStatus`) which checks the transition map in `src/lib/workflow.ts`, writes history and the audit log in the same transaction, and then queues customer email and integration events. The statuses `Quotation issued` and `Accepted` can only be set by the quotation workflow.
5. **Quotation revisions are immutable once submitted.** A change creates a new revision; earlier ones are kept (`Superseded`). Customers can only answer the newest issued revision, and a conditional update stops two simultaneous clicks both succeeding.
6. **Email is an outbox.** Actions write a `NotificationEvent` row and a job. The worker delivers with retries and back-off. `Sent` means the provider accepted the message — not that it reached the inbox. With no provider the status is `Skipped`, never `Sent`.
7. **Files are private.** They live outside `public/`, are validated by extension, size and file signature, are stored under random names, and are served only through short-lived signed URLs bound to the signed-in user.
8. **Rate limits** are stored in PostgreSQL, so they work across processes and restarts.
9. **Every important action is audited** (`AuditEvent`) with actor, time, entity and, for sign-in events, address.

## Data model (summary)

`User` · `Session` · `AuthToken` · `Company` · `Contact` · `CompanyMembership` · `Service` · `ServiceField` · `QuoteRequest` (+ `QuoteRequestItem`, `StatusHistory`, `InfoRequest`, `Communication`, `Document`, `Task`) · `Quotation` · `QuotationRevision` · `QuotationLineItem` · `QuotationApproval` · `QuotationDecision` · `Category` · `Brand` · `Product` · `ProductVariant` · `ProjectList` · `ProjectListItem` · `Faq` · `Setting` · `NotificationEvent` · `Job` · `Integration` · `IntegrationLog` · `AuditEvent` · `RateLimit` · `Counter`.

Request details are stored as JSON together with a **snapshot of the field labels at submission time**, so editing a request type later never rewrites history. The same idea applies to items: a `QuoteRequestItem` keeps its own label, unit and SKU, and a `QuotationLineItem` keeps its own wording and SKU, so deleting or renaming a product never rewrites a past request or quotation.

### Catalogue and project list

- `Category` → `Product` → `ProductVariant` (size, SKU, unit, availability, internal price). Only `PUBLISHED` products and visible sizes are read by the public site, and `shapeProduct` removes `price` from every public shape, which a test enforces.
- A `ProjectList` belongs to a guest (found by the SHA-256 of a random cookie token) or to a user. On sign-in the guest list is merged into the account list (matching lines are summed). It holds at most 150 lines.
- `submitRequest` rebuilds each catalogue line from the **database**, not from what the browser sent, and refuses a product that is no longer published.
- `createQuotation` starts the first revision from the request's items, priced from the price book where a value exists. Staff must review every line before submitting.

## Pages and routes

Public: `/`, `/catalogue`, `/catalogue/[slug]`, `/products/[slug]`, `/search`, `/list`, `/services`, `/services/[slug]`, `/about`, `/partnerships/geepee`, `/how-it-works`, `/contact`, `/privacy`, `/terms`, `/request`, `/request/confirmation/[reference]`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/robots.txt`, `/sitemap.xml`.

Portal: `/portal`, `/portal/requests`, `/portal/requests/[id]`, `/portal/quotations/[id]`, `/portal/account`.

Console: `/admin`, `/admin/requests` (+`/[id]`), `/admin/customers` (+`/[id]`), `/admin/quotations` (+`/[id]`), `/admin/tasks`, `/admin/services` (+`/[id]`), `/admin/catalogue` (+categories, products, CSV export), `/admin/content`, `/admin/reports` (+CSV export), `/admin/users`, `/admin/settings`, `/admin/integrations`, `/admin/notifications`, `/admin/audit`, `/admin/account`.

Other: `GET /api/health`, `POST /api/requests` (used by the builder for upload progress), `POST /api/jobs/run` (bearer `CRON_SECRET`), `/files/[id]` (signed), `/quotation-pdf/[revisionId]`.

## Background jobs

`send_notification` (email delivery), `maintenance` (expire quotations, follow-up reminders, remove old sessions/tokens/rate-limit rows/finished jobs, strip single-use links from delivered sign-in emails), integration events. Jobs are claimed with `FOR UPDATE SKIP LOCKED`, so running more than one worker is safe.

## Executive platform layer

- **Content**: `Article` (+ categories, per-day `ArticleView` counters), `TimelineEntry`, `Division`, `Opportunity`, `MediaItem`, `SeoEntry`; executive profile, departments and SEO settings live in `SiteSetting`.
- **Publishing**: `src/server/journal.ts` (save/publish/schedule/unpublish rules, placeholder guard, scheduled publishing run by the worker and before public reads). Pure formatting rules per platform are in `src/lib/journal.ts`.
- **Social**: `src/server/social/` has one adapter per platform behind a common error model (auth, rate, transient, rejected). Tokens are encrypted at rest. Each `SocialPost` is sent by the `social_publish` job (3 attempts, backoff); anything that cannot be sent becomes `NEEDS_MANUAL` with a plain-words note. Platform base URLs can be overridden with `SOCIAL_API_BASE_<PLATFORM>` (used by the simulated-server tests).
- **Staff portal**: `/staff/*`, guarded by `requireInternal()`; `STAFF_MEMBER` has no console permissions. Documents are stored as INTERNAL, scanned, and served only through `/staff/documents/[id]/file` (signed-in staff, `no-store`).
- **Routing**: each request type has a `department`; the department's email(s) are notified and the request records it.
- **Analytics**: GA4/Plausible load only after cookie consent; conversion events `generate_lead` and `whatsapp_click` carry no personal data.
- **Public routes added**: `/chris-iyoha`, `/leadership`, `/divisions`, `/divisions/[slug]`, `/opportunities`, `/opportunities/[slug]`, `/journal`, `/journal/[slug]`, `/journal/category/[slug]`, `/journal/feed.xml`, `/media-centre`, `/partnerships/geepee-tanks` (404 until published). Console routes added: `/admin/journal` (+new, `[id]`, preview, social), `/admin/profile`, `/admin/divisions`, `/admin/opportunities`, `/admin/media-centre`, `/admin/seo`, `/admin/staff-portal`, `/admin/insights`, `/admin/departments`.
