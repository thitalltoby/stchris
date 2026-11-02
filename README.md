# St. Chris Materials Desk

A buying platform for **St. Chris Global Limited** (building materials, plumbing, bathroom and kitchen solutions, water storage and tiles). It is not a brochure site. A visitor builds a **project list**, sends it for a **written quotation**, and then tracks and accepts that quotation online. Retail customers are pointed to the affiliated storefront, [Sweethome](https://sweethomebathrooms.com).

- **Catalogue** — 11 categories, products with sizes, SKUs and availability, search, and "what we supply" lines that can be added to a list even before a product page exists. The internal price book is never shown publicly.
- **Project list** — a persistent basket that lives on the server (not in the browser). It follows the visitor from phone to laptop once they sign in, and is copied onto a request when they send it.
- **Ways to buy** — seven request types: quote a project list, project and bulk supply, source something specific, open a trade account, dealer or reseller partnership, supplier introduction, ask a question. Each has its own questions, editable by staff.
- **Customer portal** — request history, answering questions from the team, reading and accepting or declining quotations, copying an earlier request back onto a new list, colleague invitations.
- **Staff console** — requests, assignment and status workflow, CRM, tasks, quotations that start from the customer's list and price book (revisions, an approval step, PDF), reports with CSV export, catalogue with CSV import and export, company pages, photo library, users and roles, staff two-factor sign-in, offline quotation decisions, upload scanning, integrations (email, SMS, WhatsApp, analytics, webhook, CRM, accounting, delivery and dispatch, stock, documents), notification log and audit log.

A project list and a request are **not orders**, and the site says so. Prices, availability and delivery are only ever confirmed in a written quotation that the customer accepts.

> **Read first:** [`docs/IMPLEMENTATION_CHECKLIST.md`](docs/IMPLEMENTATION_CHECKLIST.md) says what is built, what is tested and what is not. [`docs/CONTENT_REGISTER.md`](docs/CONTENT_REGISTER.md) lists every fact, image and arrangement St. Chris must confirm before launch. [`docs/OUTSTANDING_ITEMS.md`](docs/OUTSTANDING_ITEMS.md) lists the decisions, credentials and engineering work still open.

Visual identity is taken from the supplied St. Chris logo (orange `#F96D11`, a darker accessible orange `#B4430A` for text, warm charcoal) with TT Firs Neue (licensed; **not bundled**: drop the `.woff2` files into `public/fonts/`, see `public/fonts/README.txt`) and Figtree / IBM Plex as fallbacks.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · PostgreSQL 16 · Prisma 7 · Tailwind 4 · zod · pdfkit · vitest · Playwright (+ axe).

> This Next.js version has breaking changes from older releases. Read the matching guide in `node_modules/next/dist/docs/` before changing framework-level code (see `AGENTS.md`).

## Run it locally

```bash
# 1. PostgreSQL 16 with an empty database
createdb stchris

# 2. Configure
cp .env.example .env        # edit DATABASE_URL and APP_SECRET (openssl rand -base64 48)

# 3. Install, create tables, load starter content
npm ci
npx prisma generate
npx prisma migrate deploy
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='a-long-password-1' npm run db:seed

# 4. Start (two processes: the web app and the background worker)
npm run dev
npm run worker              # sends email, reminders, expires quotations
```

Open <http://localhost:3000>. Staff sign in at `/admin/login`; customers at `/login`.

The seed is **create-only**: it adds the categories, three products (the ones visible in the supplied photographs), the seven request types and the FAQs, and never overwrites anything staff have edited. Company address, phone and email start **empty** and are only shown once entered in *Settings*.

With **no email provider configured** nothing is sent: messages are recorded in the notification log as *Skipped*, and in development the text (including verification and reset links) is printed to the server console.

For throw-away demo accounts (development only, never in production): `SEED_DEMO_USERS=true npm run db:seed` creates `admin@`, `ops@`, `staff@`, `commercial@`, `approver@stchris.local` with the password `DevPassword-123`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run worker` | Background job loop (email, reminders, expiry, housekeeping) |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Create starter content; create the first Super Admin when `SEED_ADMIN_*` are set. Never overwrites existing content |
| `npm run admin:create` | Interactively create a Super Admin |
| `npm run typecheck`, `npm run lint` | Static checks |
| `npm test` | Unit + integration tests (needs the `stchris_test` database) |
| `npm run test:e2e` | Browser tests (needs a production build and the `stchris_test` database) |

### Tests

Both suites use a **separate database called `stchris_test`**, which they empty before running. They refuse to run against any other database name.

```bash
createdb stchris_test
DATABASE_URL=postgresql://USER:PASS@localhost:5432/stchris_test npx prisma migrate deploy
npm test
npm run build && npm run test:e2e      # desktop + Pixel 7 projects
```

Run the two suites one after the other, not at the same time (they share that database).

## Where things are

```
src/app/(site)      public pages: catalogue, products, list, request builder, sign-in/up
src/app/portal      customer portal
src/app/admin       staff console
src/server          business logic (all authorisation lives here, not in the UI)
src/lib             pure helpers shared with the browser (money, workflow, permissions, validation)
src/content         starter copy, categories, products and request types
prisma/             schema, migration, seed
scripts/            worker and admin creation
tests/              unit, integration, e2e
docs/               operating documentation
deploy/             example container files (NOT yet built or run: see docs/DEPLOYMENT.md)
```

More: [Architecture](docs/ARCHITECTURE.md) · [Deployment](docs/DEPLOYMENT.md) · [Backup & recovery](docs/BACKUP_RECOVERY.md) · [Admin guide](docs/ADMIN_GUIDE.md) · [Security](docs/SECURITY.md) · [Content register](docs/CONTENT_REGISTER.md)

## Executive platform (added)

On top of the Materials Desk, the site is now an editorial executive and corporate platform: a Chris Iyoha profile and Leadership page, six business divisions with their own pages, opportunities with enquiry routing to departments, a media centre, a mobile-first journal with drafts, scheduling, photos, video links, SEO and preview, **social publishing to LinkedIn, Facebook, Instagram and X with an honest manual fallback**, a staff portal with role-based access, and an admin area with roles, social accounts, publishing logs, SEO and insights. See `docs/ADMIN_GUIDE.md`, `docs/ARCHITECTURE.md` and **`docs/OUTSTANDING_ITEMS.md` §F** (what is not yet verified against live services).

Dev demo accounts (after `SEED_DEMO_USERS=true npm run db:seed`, password `DevPassword-123`): `content@`, `comms@`, `employee@stchris.local` alongside the existing admin, ops, staff, commercial and approver users.
