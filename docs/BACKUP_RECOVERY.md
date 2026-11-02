# Backup and recovery

## What must be backed up

| Data | Where | How often |
|---|---|---|
| Database (everything: requests, customers, quotations, audit, settings, content) | PostgreSQL | At least daily; before every migration |
| Uploaded files and generated documents | `STORAGE_DIR` | At least daily, and at the same moment as the database where possible |
| Configuration | `.env` / your secret manager | Whenever it changes; store separately and securely |

**`APP_SECRET` matters:** keep a copy with the backups. Without the same value, integration secrets stored in the database cannot be decrypted (they would have to be re-entered) and signed links stop working.

## Database

```bash
# nightly, from cron — custom format is compressed and restores selectively
pg_dump --format=custom --file=/backups/stchris-$(date +%F).dump "$DATABASE_URL"
```

Keep, for example, 14 daily and 12 monthly copies, and copy them **off the server**. Managed PostgreSQL services offer point-in-time recovery; enable it.

## Files

```bash
rsync -a --delete-after /srv/stchris/storage/ /backups/storage/   # or snapshot the volume
```

The database stores each file's name, size and SHA-256 and the storage key; a restored database with a missing file answers “not found” on download.

## Restoring

1. Stop the web app and worker.
2. Create an empty database and restore:
   `pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" /backups/stchris-YYYY-MM-DD.dump`
3. Restore the files into `STORAGE_DIR`.
4. Put back `.env` (same `APP_SECRET`).
5. `npx prisma migrate status` — it should report the database is up to date.
6. Start the web app and worker. Check `/api/health`, sign in, open a recent request and download its attachment.
7. Note in the audit trail why the restore happened. Customers who submitted requests after the backup was taken will need to resubmit — if your recovery point is more than a few hours old, tell recent customers.

## Rehearse it

A backup that has never been restored is a hope, not a backup. Before go-live, and every quarter afterwards, restore the latest backup into a scratch database, point a staging copy of the app at it, and confirm a request, a quotation PDF and an attachment all open.

## Recovery targets

None are promised by the software. Decide with St. Chris what loss of data is tolerable (the schedule above allows up to 24 hours) and how quickly service must return, then set backup frequency and standby arrangements to match.

## Journal, media and staff documents

Articles, divisions, opportunities, the media centre, staff posts and social account records (tokens are encrypted with a key derived from `APP_SECRET`) are all in PostgreSQL, so the normal database backup covers them. Uploaded pictures and staff documents are in `STORAGE_DIR` and must be backed up with it. **Keep `APP_SECRET` safe: without it, stored social tokens cannot be decrypted and each account must be reconnected.** After restoring, check **Social queue** and press *Check* on each account.
