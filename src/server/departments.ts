import 'server-only';
import { getSetting } from './settings';

/** A department and the addresses that hear about its requests. Unknown keys fall back to Sales. */
export async function getDepartment(key: string): Promise<{ key: string; label: string; recipients: string[] } | null> {
  const all = await getSetting('departments');
  const d = all.find((x) => x.key === key) ?? all.find((x) => x.key === 'sales');
  if (!d) return null;
  return { key: d.key, label: d.label, recipients: d.email.split(/[,;\s]+/).map((e) => e.trim()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) };
}
