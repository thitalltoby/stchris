import 'server-only';
import { db } from './db';

export * from './settings-defaults';
import { DEFAULTS, type CompanySettings, type QuoteSettings, type NotificationSettings, type SecuritySettings, type NoticeSettings, type Fact, type Department, type ExecutiveSettings, type SeoSettings } from './settings-defaults';

export type SettingKey = keyof typeof DEFAULTS;
type Map = { company: CompanySettings; quotes: QuoteSettings; notifications: NotificationSettings; security: SecuritySettings; notice: NoticeSettings; facts: Fact[]; departments: Department[]; executive: ExecutiveSettings; seo: SeoSettings };

export async function getSetting<K extends SettingKey>(key: K): Promise<Map[K]> {
  const row = await db.siteSetting.findUnique({ where: { key } });
  const def = DEFAULTS[key] as any;
  if (!row) return def;
  if (Array.isArray(def)) return (Array.isArray(row.value) ? row.value : def) as any;
  return { ...def, ...(row.value as object) } as any;
}

export async function setSetting<K extends SettingKey>(key: K, value: Map[K], updatedBy?: string) {
  await db.siteSetting.upsert({
    where: { key },
    create: { key, value: value as any, updatedBy: updatedBy ?? null },
    update: { value: value as any, updatedBy: updatedBy ?? null },
  });
}
