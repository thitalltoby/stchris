import 'server-only';
import { db } from './db';
import { audit } from './audit';
import { decryptJson, encryptJson } from './crypto';
import { invalid, notFound } from './errors';
import { assertCan, type Principal } from './rbac';
import { ADAPTERS, adapterByKey, assertSafeUrl } from './integrations/registry';
import type { ConfigField } from './integrations/core';
import { activeMailProvider } from './mail';

/** Which message channels are switched on: the request form only offers opt-in boxes for these. Safe to call without a session. */
export async function enabledMessagingChannels(): Promise<{ sms: boolean; whatsapp: boolean }> {
  try {
    const rows = await db.integration.findMany({ where: { key: { in: ['sms', 'whatsapp'] }, enabled: true }, select: { key: true } });
    return { sms: rows.some((r) => r.key === 'sms'), whatsapp: rows.some((r) => r.key === 'whatsapp') };
  } catch {
    return { sms: false, whatsapp: false };
  }
}

export async function listIntegrations(user: Principal) {
  assertCan(user, 'integration.manage');
  for (const a of ADAPTERS) {
    await db.integration.upsert({ where: { key: a.key }, create: { key: a.key, name: a.name, category: a.category }, update: {} });
  }
  const rows = await db.integration.findMany({ include: { logs: { orderBy: { createdAt: 'desc' }, take: 5 } } });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const email = await activeMailProvider();
  return ADAPTERS.map((a) => {
    const row = byKey.get(a.key)!;
    const secrets = decryptJson(row.secretEnc) ?? {};
    return {
      adapter: a,
      id: row.id,
      enabled: row.enabled,
      config: row.config as Record<string, string> & { events?: string[] },
      secretsSet: Object.fromEntries(a.fields.filter((f) => f.secret).map((f) => [f.key, !!secrets[f.key]])),
      lastCheckedAt: row.lastCheckedAt,
      lastStatus: row.lastStatus,
      lastMessage: row.lastMessage,
      logs: row.logs,
      emailProvider: email,
    };
  });
}

export async function saveIntegration(user: Principal, key: string, input: { enabled: boolean; values: Record<string, string>; events?: string[] }) {
  assertCan(user, 'integration.manage');
  const a = adapterByKey(key);
  if (!a) throw notFound('Unknown integration.');
  const row = await db.integration.findUnique({ where: { key } });
  if (!row) throw notFound('Unknown integration.');
  const secrets: Record<string, string> = { ...(decryptJson(row.secretEnc) ?? {}) };
  const config: Record<string, string> = {};
  for (const f of a.fields) {
    const v = (input.values[f.key] ?? '').trim();
    if (f.secret) {
      if (v) secrets[f.key] = v; // blank = keep the stored secret
    } else config[f.key] = v;
  }
  const showFor = (f: ConfigField) => !f.showFor || f.showFor.values.includes(config[f.showFor.key] ?? '');
  if (input.enabled) {
    for (const f of a.fields) {
      if (!f.required || !showFor(f)) continue;
      const present = f.secret ? !!secrets[f.key] : !!config[f.key];
      if (!present) throw invalid(`${f.label} is required to enable this integration.`, { [f.key]: 'Required.' });
    }
    try { a.validate?.(config, secrets); } catch (e) { throw invalid(e instanceof Error ? e.message : 'Check the settings.'); }
    if (key === 'webhook') await assertSafeUrl(config.url ?? '').catch((e) => { throw invalid(e.message, { url: e.message }); });
    if ('baseUrl' in config && config.baseUrl && key !== 'email' && key !== 'webhook') await assertSafeUrl(config.baseUrl).catch((e) => { throw invalid(`API base URL: ${e.message}`, { baseUrl: e.message }); });
  }
  const events = (input.events ?? a.events).filter((e) => a.events.includes(e));
  await db.integration.update({ where: { key }, data: { enabled: input.enabled, config: { ...config, events } as object, secretEnc: encryptJson(secrets), ...(input.enabled ? {} : {}) } });
  await audit({ id: user.id, label: user.name }, 'integration.saved', 'Integration', row.id, { key, enabled: input.enabled });
}

export async function testIntegration(user: Principal, key: string) {
  assertCan(user, 'integration.manage');
  const a = adapterByKey(key);
  const row = await db.integration.findUnique({ where: { key } });
  if (!a || !row || !a.test) throw notFound('This integration cannot be tested.');
  let result: { ok: boolean; message: string };
  try {
    result = await a.test(row.config as Record<string, string>, decryptJson(row.secretEnc) ?? {}, { userEmail: user.email });
  } catch (e) {
    result = { ok: false, message: e instanceof Error ? e.message : 'Test failed.' };
  }
  await db.integration.update({ where: { key }, data: { lastCheckedAt: new Date(), lastStatus: result.ok ? 'OK' : 'ERROR', lastMessage: result.message } });
  await db.integrationLog.create({ data: { integrationId: row.id, event: 'test', status: result.ok ? 'OK' : 'ERROR', responseSummary: result.message } });
  return result;
}
