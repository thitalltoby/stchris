import type { NoticeSettings } from '@/server/settings-defaults';

/** Lagos is UTC+1 all year, so "the last day" ends at 23:59:59 on +01:00. */
const endOfDay = (d: string) => new Date(`${d}T23:59:59+01:00`).getTime();

/** Same-site path or https address only: no javascript:, data:, protocol-relative or plain http links. */
export function safeNoticeHref(href: string): boolean {
  if (!href) return true;
  if (/[\s<>"']/.test(href)) return false;
  if (href.startsWith('/')) return !href.startsWith('//') && !href.includes('\\');
  try { return new URL(href).protocol === 'https:'; } catch { return false; }
}

export type NoticeCheck = { ok: true; value: NoticeSettings } | { ok: false; error: string; field: keyof NoticeSettings };

export function checkNotice(input: NoticeSettings): NoticeCheck {
  const text = input.text.trim().replace(/\s+/g, ' ');
  const href = input.href.trim();
  const linkLabel = input.linkLabel.trim();
  const endsOn = input.endsOn.trim();
  if (input.enabled && text.length < 3) return { ok: false, field: 'text', error: 'Write the announcement before switching it on.' };
  if (text.length > 160) return { ok: false, field: 'text', error: 'Keep the announcement to 160 characters.' };
  if (!safeNoticeHref(href)) return { ok: false, field: 'href', error: 'Use a page on this site (starting with /) or an https:// address.' };
  if (href && !linkLabel) return { ok: false, field: 'linkLabel', error: 'Give the link a label, for example “Read more”.' };
  if (linkLabel.length > 40) return { ok: false, field: 'linkLabel', error: 'Keep the link label to 40 characters.' };
  if (endsOn && (!/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || Number.isNaN(endOfDay(endsOn)))) return { ok: false, field: 'endsOn', error: 'Use a valid date.' };
  return { ok: true, value: { enabled: input.enabled, text, href, linkLabel: href ? linkLabel : '', endsOn } };
}

export function noticeVisible(n: NoticeSettings, now = new Date()): boolean {
  if (!n.enabled || n.text.trim().length < 3) return false;
  if (!safeNoticeHref(n.href)) return false; // a stored value is re-checked at render time
  if (n.endsOn && now.getTime() > endOfDay(n.endsOn)) return false;
  return true;
}
