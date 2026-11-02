/**
 * Background worker: runs due jobs (email delivery with retries, task reminders, integration events,
 * quotation expiry, housekeeping) every 30 seconds. Run as a second process next to the web app:
 *   npm run worker
 * If you prefer a scheduler instead, call POST /api/jobs/run every minute with the CRON_SECRET.
 */
import 'dotenv/config';
import { tick } from '../src/server/handlers';

let stopping = false;
process.on('SIGTERM', () => (stopping = true));
process.on('SIGINT', () => (stopping = true));

async function loop() {
  console.log('[worker] started');
  while (!stopping) {
    try {
      const r = await tick();
      if (r.ran || r.failed) console.log(`[worker] ran ${r.ran}, failed ${r.failed}`);
    } catch (e) {
      console.error('[worker] tick failed', e);
    }
    for (let i = 0; i < 30 && !stopping; i++) await new Promise((r) => setTimeout(r, 1000));
  }
  console.log('[worker] stopped');
  process.exit(0);
}
loop();
