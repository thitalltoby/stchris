import { describe, it, expect } from 'vitest';
import { findPlaceholders, readingMinutes, normaliseTags, parseVideoUrl, composePost, manualReason, normaliseHashtags, escapeLinkedIn, SPECS } from '@/lib/journal';

describe('placeholder guard', () => {
  it('finds [[...]] markers anywhere in the text', () => {
    expect(findPlaceholders('Opening [[year the partnership began]] and later [[quote]].')).toEqual(['year the partnership began', 'quote']);
    expect(findPlaceholders('Nothing to fill in. [single brackets] are fine.')).toEqual([]);
  });
});

describe('tags and reading time', () => {
  it('normalises, de-duplicates and caps tags', () => {
    expect(normaliseTags('Leadership, #Enterprise growth, leadership , ')).toEqual(['leadership', 'enterprise-growth']);
    expect(normaliseTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(10);
  });
  it('estimates at least one minute', () => {
    expect(readingMinutes('short')).toBe(1);
    expect(readingMinutes('word '.repeat(660))).toBe(3);
  });
});

describe('video links', () => {
  it('accepts YouTube and Vimeo and returns privacy-friendly embeds', () => {
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.embed).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')?.id).toBe('dQw4w9WgXcQ');
    expect(parseVideoUrl('https://vimeo.com/123456789')?.embed).toBe('https://player.vimeo.com/video/123456789?dnt=1');
  });
  it('rejects everything else, including scripts and look-alike hosts', () => {
    for (const bad of ['http://youtu.be/dQw4w9WgXcQ', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'not a url', '']) expect(parseVideoUrl(bad)).toBeNull();
  });
});

describe('platform-specific composition', () => {
  const base = { url: 'https://stchris.example/journal/trust', includeLink: true };
  it('puts the link in LinkedIn and Facebook posts', () => {
    const c = composePost('linkedin', { ...base, caption: 'A note on trust.', hashtags: ['Leadership', 'Enterprise'] });
    expect(c.text).toBe('A note on trust.\n\n#Leadership #Enterprise\n\nhttps://stchris.example/journal/trust');
    expect(c.tooLong).toBe(false);
  });
  it('counts a link as 23 characters on X and flags posts over 280', () => {
    const ok = composePost('x', { ...base, caption: 'a'.repeat(200), hashtags: [] });
    expect(ok.length).toBe(200 + 2 + 23);
    expect(ok.tooLong).toBe(false);
    expect(composePost('x', { ...base, caption: 'a'.repeat(260), hashtags: [] }).tooLong).toBe(true);
  });
  it('never puts a link in an Instagram caption and says so', () => {
    const c = composePost('instagram', { ...base, caption: 'New article.', hashtags: ['business'] });
    expect(c.text).not.toContain('https://');
    expect(c.text).toContain('link in bio');
    expect(c.notes.join(' ')).toMatch(/not make links in captions clickable/);
  });
  it('limits hashtags per platform and strips symbols', () => {
    expect(normaliseHashtags('#a, #b #c #d #e', 3)).toEqual(['a', 'b', 'c']);
    expect(normaliseHashtags(['#Lead-ership!', 'lead-ership'], 5)).toEqual(['Leadership']);
    expect(SPECS.x.maxHashtags).toBe(3);
  });
});

describe('when automation is not possible', () => {
  const ok = { hasImage: true, imageIsJpeg: true, publicSite: true, composedTooLong: false };
  it('allows normal posts', () => { for (const p of ['linkedin', 'facebook', 'instagram', 'x'] as const) expect(manualReason(p, ok)).toBeNull(); });
  it('explains each Instagram limitation in plain words', () => {
    expect(manualReason('instagram', { ...ok, hasImage: false })).toMatch(/needs a picture/);
    expect(manualReason('instagram', { ...ok, imageIsJpeg: false })).toMatch(/JPEG/);
    expect(manualReason('instagram', { ...ok, publicSite: false })).toMatch(/live public website/);
    expect(manualReason('linkedin', { ...ok, hasImage: false })).toBeNull();
  });
  it('asks for shortening when the text is too long', () => { expect(manualReason('x', { ...ok, composedTooLong: true })).toMatch(/280/); });
});

describe('LinkedIn markup', () => {
  it('escapes reserved characters but leaves hashtags alone', () => {
    expect(escapeLinkedIn('Growth (2026) [draft] #Leadership')).toBe('Growth \\(2026\\) \\[draft\\] #Leadership');
  });
});
