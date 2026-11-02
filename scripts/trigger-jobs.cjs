/**
 * Calls POST /api/jobs/run once. Used by the Render cron job in render.yaml (every minute) in place of
 * the long-running worker, because a Render disk can only be attached to one service.
 *   APP_URL=https://… CRON_SECRET=… node scripts/trigger-jobs.cjs
 */
const { APP_URL, CRON_SECRET } = process.env;
if (!APP_URL || !CRON_SECRET) {
  console.error('[jobs] APP_URL and CRON_SECRET are required');
  process.exit(1);
}

fetch(new URL('/api/jobs/run', APP_URL), {
  method: 'POST',
  headers: { Authorization: `Bearer ${CRON_SECRET}` },
  signal: AbortSignal.timeout(50_000),
})
  .then(async (res) => {
    const body = await res.text();
    console.log(`[jobs] ${res.status} ${body}`);
    if (!res.ok) process.exit(1);
  })
  .catch((e) => {
    console.error('[jobs] request failed', e);
    process.exit(1);
  });
