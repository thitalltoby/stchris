import { describe, it, expect } from 'vitest';
import { checkNotice, noticeVisible, safeNoticeHref } from '@/lib/notice';

const base = { enabled: true, text: 'Office closed on Friday', href: '', linkLabel: '', endsOn: '' };

describe('site announcement', () => {
  it('accepts same-site paths and https links only', () => {
    for (const ok of ['', '/contact', '/insights/some-post', 'https://example.com/a']) expect(safeNoticeHref(ok), ok).toBe(true);
    for (const bad of ['javascript:alert(1)', 'http://example.com', '//evil.example', '/\\evil', 'data:text/html,x', 'contact', '/a b', 'https://exa mple.com']) expect(safeNoticeHref(bad), bad).toBe(false);
  });
  it('will not switch on an empty announcement, and caps its length', () => {
    expect(checkNotice({ ...base, text: '  ' }).ok).toBe(false);
    expect(checkNotice({ ...base, enabled: false, text: '' }).ok).toBe(true);
    expect(checkNotice({ ...base, text: 'x'.repeat(161) }).ok).toBe(false);
  });
  it('needs a label when there is a link, and drops a stray label when there is not', () => {
    expect(checkNotice({ ...base, href: '/contact' }).ok).toBe(false);
    const r = checkNotice({ ...base, href: '', linkLabel: 'Read more' });
    expect(r.ok && r.value.linkLabel).toBe('');
  });
  it('rejects a malformed end date', () => {
    expect(checkNotice({ ...base, endsOn: '31/12/2026' }).ok).toBe(false);
    expect(checkNotice({ ...base, endsOn: '2026-12-31' }).ok).toBe(true);
  });
  it('shows until the end of the last day in Lagos time, then hides by itself', () => {
    const n = { ...base, endsOn: '2026-11-05' };
    expect(noticeVisible(n, new Date('2026-11-05T22:30:00Z'))).toBe(true);  // 23:30 in Lagos
    expect(noticeVisible(n, new Date('2026-11-05T23:00:01Z'))).toBe(false); // just after midnight in Lagos
  });
  it('is hidden when off, and a stored unsafe link is never rendered', () => {
    expect(noticeVisible({ ...base, enabled: false })).toBe(false);
    expect(noticeVisible({ ...base, href: 'javascript:alert(1)', linkLabel: 'x' })).toBe(false);
  });
});
