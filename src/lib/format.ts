const TZ = 'Africa/Lagos';

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }).format(new Date(d));
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(d));
}

export function fmtRelativeDays(d: Date | string | null | undefined, now = new Date()): string {
  if (!d) return '—';
  const diff = Math.round((new Date(d).getTime() - now.getTime()) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
  return p;
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

/** Default due date for a new follow-up: two days from now, as a yyyy-mm-dd string. */
export function defaultDueDate(days = 2): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** A stored moment as the value of a datetime-local input, in Lagos time (UTC+1, no daylight saving). */
export function toLagosLocalInput(d: Date | string | null | undefined): string {
  if (!d) return '';
  return new Date(new Date(d).getTime() + 3_600_000).toISOString().slice(0, 16);
}

/** The reverse: what a datetime-local input means, read as Lagos time. Returns an ISO string, or '' when empty. */
export function fromLagosLocalInput(v: string): string {
  const m = (v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(m)) return '';
  return `${m}:00+01:00`;
}
