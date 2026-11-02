import 'server-only';
import { db } from '../db';
import { enqueueJob, registerJob } from '../jobs';
import { decryptJson } from '../crypto';
import { adapterByKey, type EventName } from './registry';

/** Queue an event for every enabled integration subscribed to it. Never throws into business flows. */
export async function emitEvent(event: EventName, payload: Record<string, unknown>, uniqueId: string) {
  try {
    const rows = await db.integration.findMany({ where: { enabled: true } });
    for (const i of rows) {
      const adapter = adapterByKey(i.key);
      if (!adapter?.handle || !adapter.events.includes(event)) continue;
      const cfg = i.config as { events?: string[] };
      if (cfg.events && !cfg.events.includes(event)) continue;
      await enqueueJob('integration_event', { integrationId: i.id, event, payload }, { dedupeKey: `int:${i.id}:${event}:${uniqueId}`, maxAttempts: 6 });
    }
  } catch (e) {
    console.error('[integrations] could not queue event', e);
  }
}

registerJob('integration_event', async (p: { integrationId: string; event: string; payload: unknown }) => {
  const i = await db.integration.findUnique({ where: { id: p.integrationId } });
  if (!i || !i.enabled) return;
  const adapter = adapterByKey(i.key);
  if (!adapter?.handle) return;
  const started = Date.now();
  try {
    const out = await adapter.handle(p.event, p.payload, i.config as Record<string, string>, decryptJson(i.secretEnc) ?? {});
    await db.integrationLog.create({ data: { integrationId: i.id, event: p.event, status: 'OK', responseSummary: out.summary, durationMs: Date.now() - started } });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
    await db.integrationLog.create({ data: { integrationId: i.id, event: p.event, status: 'ERROR', error: msg, durationMs: Date.now() - started } });
    throw e;
  }
});
