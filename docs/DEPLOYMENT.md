# Deployment

> **Status.** The application has been built and run in production mode (`next build` / `next start`) with PostgreSQL 16 and exercised by the browser tests. It has **not** been deployed to a real server, behind a real TLS proxy, or built into a container image: the development environment had no container daemon. The files in `deploy/` are starting points that have not been run. Treat the first deployment as a rehearsal, using the checklist at the end.

## What you need

| Item | Notes |
|---|---|
| Node.js ≥ 20.12 | 22 LTS recommended |
| PostgreSQL 16 | Managed service or your own server. Daily backups are essential (see `BACKUP_RECOVERY.md`) |
| A persistent directory for uploads | `STORAGE_DIR`. Not inside `public/`. Must survive restarts and be backed up |
| HTTPS in front of the app | nginx, Caddy or a platform load balancer. Set `TRUST_PROXY=true` only behind a proxy you control |
| An email provider | Resend (API key) or any SMTP account. A verified sending domain (SPF/DKIM) is needed for reliable delivery |
| Two long-running processes | the web app and `npm run worker` |

## Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `CLAMAV_HOST` / `CLAMAV_PORT` | no | Address of a ClamAV daemon (default port 3310). Empty = built-in upload checks only |
| `ANALYTICS_EXTRA_HOSTS` | no | Extra https hosts to allow in the content-security-policy for a different analytics tool (comma separated). Also needs a code change to load that tool |
| `APP_SECRET` | yes | ≥ 32 random characters. Signs file and confirmation links and encrypts integration secrets. **Changing it invalidates links in flight and makes stored integration secrets unreadable** — re-enter them afterwards. The app refuses to start in production with a placeholder |
| `APP_URL` | yes | Public address, `https://…` in production. Used in emails and PDFs |
| `EMAIL_FROM` | for email | e.g. `St. Chris <desk@stchris.example>` — use an address on a domain you have verified |
| `RESEND_API_KEY` **or** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | for email | Without either, messages are recorded as *Skipped* |
| `STORAGE_DIR` | yes | Absolute path of the private upload directory |
| `CRON_SECRET` | optional | Enables `POST /api/jobs/run` (header `Authorization: Bearer …`). Use it if you run a scheduler **instead of** the worker |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | default `true` | Keep `true` in production |
| `TRUST_PROXY` | default `false` | `true` makes the app read the client address from `X-Forwarded-For` (used for rate limits and audit). Leave `false` if the app is directly exposed, or attackers can spoof it |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | first run only | Creates the first Super Admin. Remove afterwards |

Never commit `.env`. Secrets are never sent to the browser or written to logs.

## Steps (single server)

```bash
git clone … && cd stchris
npm ci
npx prisma generate
npm run build
npx prisma migrate deploy            # creates the tables
SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… npm run db:seed   # starter content + first Super Admin
npm run start                        # web, port 3000
npm run worker                       # second process
```

Run both under a supervisor (systemd, pm2, your platform's process manager) so they restart on failure. Example systemd unit for the worker:

```ini
[Service]
WorkingDirectory=/srv/stchris
EnvironmentFile=/srv/stchris/.env
ExecStart=/usr/bin/npm run worker
Restart=always
```

Put nginx/Caddy in front for TLS and set `client_max_body_size 60m;` (uploads are up to 5 files × 10 MB). Check `GET /api/health` — it returns `ok` only when the database answers.

### Migrations

`prisma/migrations/20261023120000_init` creates the whole schema. For later changes use `npx prisma migrate dev --name …` on a development machine and ship the generated folder; production only ever runs `prisma migrate deploy`. **Back up before every migration.**

> The initial migration was produced with an offline SQL generator because the development environment could not download Prisma's schema engine. On a normal machine, before go-live run `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url …` and confirm it reports no differences. If it does, add a corrective migration.

### Updating

1. Back up the database. 2. Pull the new code. 3. `npm ci && npx prisma generate && npm run build`. 4. `npx prisma migrate deploy`. 5. Restart the web app and the worker. The seed is safe to re-run: it only creates content that does not exist.

## Containers (untested example)

`deploy/Dockerfile` and `deploy/docker-compose.yml` describe an app container, a worker container, PostgreSQL and a storage volume. The image has still not been built locally (no container daemon), but its build and start steps have been run outside a container: `prisma generate` and `next build` with a placeholder `DATABASE_URL`, then `migrate deploy`, the seed and `next start` against PostgreSQL. The container starts as root only to give the mounted storage directory to the `node` user (`deploy/entrypoint.sh`), then runs as `node`.

## Hosting from the repository (`render.yaml`)

`render.yaml` is a **free demo** Blueprint: free web service and database, no disk, email off, no background jobs, and `npm run start:demo` runs the migrations and seed on every start. Render deletes free databases after 30 days. The production setup is `deploy/render.paid.yaml` (create the Blueprint with that path, or copy it over `render.yaml`), described here.

`deploy/render.paid.yaml` is a Render Blueprint (New → Blueprint): a web service `stchris` built from `deploy/Dockerfile`, a PostgreSQL database, a disk for uploads, and a cron service `stchris-jobs` that calls `/api/jobs/run` every minute (`scripts/trigger-jobs.cjs`). A separate worker is not used because a Render disk attaches to one service only. Migrations run before each deploy (`preDeployCommand`). Render asks for `EMAIL_FROM` and `RESEND_API_KEY` when the Blueprint is created; `APP_SECRET` and `CRON_SECRET` are generated. After the first deploy, run the seed once from the web service's Shell. The disk, pre-deploy command and Shell need a paid instance type. Any host that can run a Node 22 service or the Docker image and provide PostgreSQL works the same way.

## Scheduler instead of the worker

If you cannot run a long-lived process, call `POST /api/jobs/run` every minute from a scheduler with `Authorization: Bearer $CRON_SECRET`. Email retries and expiry then run at that cadence.

## Go-live checklist

- [ ] `APP_SECRET` generated, `.env` not in version control
- [ ] HTTPS working; `APP_URL` uses `https://`; HSTS header present
- [ ] `TRUST_PROXY` set correctly for your proxy
- [ ] First Super Admin created; seed password removed; **demo users not created**
- [ ] Email provider configured; send a test (request a password reset for yourself) and confirm arrival
- [ ] Sending domain has SPF and DKIM
- [ ] Worker running and restarting on failure; check *Admin → Notifications* shows *Sent*
- [ ] `STORAGE_DIR` on a persistent volume, included in backups
- [ ] Database backups scheduled **and a restore rehearsed** (see BACKUP_RECOVERY.md)
- [ ] Settings reviewed: company details, contact email, notification recipients, quotation currency/tax/terms/approval threshold
- [ ] Every item in `docs/CONTENT_REGISTER.md` confirmed or removed; privacy notice and terms reviewed by St. Chris’s legal adviser
- [ ] `npm test` and `npm run test:e2e` pass on the target build
- [ ] `/robots.txt` and `/sitemap.xml` reachable; `/admin` is not indexed
