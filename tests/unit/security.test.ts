import { describe, it, expect } from 'vitest';
import { encryptJson, decryptJson, hmac, safeEqual, sha256 } from '@/server/crypto';
import { safeFileName, signedFileUrl, verifyFileSignature, saveUpload } from '@/server/storage';
import { checkPasswordPolicy } from '@/server/auth';
import { renderMarkdown } from '@/server/markdown';
import { slugify } from '@/lib/format';

describe('secret encryption', () => {
  it('round-trips and never stores plaintext', () => {
    const blob = encryptJson({ apiKey: 'sk-secret' });
    expect(blob).not.toContain('sk-secret');
    expect(decryptJson(blob)).toEqual({ apiKey: 'sk-secret' });
  });
  it('uses a fresh IV each time and rejects tampering', () => {
    expect(encryptJson({ a: 1 })).not.toBe(encryptJson({ a: 1 }));
    const blob = encryptJson({ a: 1 });
    const parts = blob.split('.');
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith('AA') ? 'BB' : 'AA');
    expect(decryptJson(parts.join('.'))).toBeNull();
    expect(decryptJson('garbage')).toBeNull();
    expect(decryptJson(null)).toBeNull();
  });
});

describe('hashing helpers', () => {
  it('compares in constant time and is purpose-bound', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(hmac('x', 'file')).not.toBe(hmac('x', 'confirm'));
    expect(sha256('a')).toHaveLength(64);
  });
});

describe('signed file URLs', () => {
  it('verifies for the same user and rejects other users, other documents and expired links', () => {
    const url = new URL(signedFileUrl('doc1', 'user1', 60), 'http://x');
    const exp = Number(url.searchParams.get('exp'));
    const sig = url.searchParams.get('sig')!;
    expect(verifyFileSignature('doc1', 'user1', exp, sig)).toBe(true);
    expect(verifyFileSignature('doc1', 'user2', exp, sig)).toBe(false);
    expect(verifyFileSignature('doc2', 'user1', exp, sig)).toBe(false);
    expect(verifyFileSignature('doc1', 'user1', exp + 1, sig)).toBe(false);
    const old = new URL(signedFileUrl('doc1', 'user1', -10), 'http://x');
    expect(verifyFileSignature('doc1', 'user1', Number(old.searchParams.get('exp')), old.searchParams.get('sig')!)).toBe(false);
  });
});

describe('uploads', () => {
  const file = (name: string, bytes: Buffer, type = 'application/octet-stream') => ({ name, type, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer });
  it('strips path tricks from file names', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('a<b>|c.pdf')).not.toMatch(/[<>|]/);
  });
  it('rejects executables, empty files and files whose bytes do not match the extension', async () => {
    await expect(saveUpload(file('x.exe', Buffer.from('MZ')))).rejects.toThrow(/not an accepted/);
    await expect(saveUpload(file('x.pdf', Buffer.alloc(0), 'application/pdf'))).rejects.toThrow(/empty/);
    await expect(saveUpload(file('fake.pdf', Buffer.from('<html>not a pdf</html>'), 'application/pdf'))).rejects.toThrow();
    await expect(saveUpload(file('fake.png', Buffer.from('%PDF-1.4'), 'image/png'))).rejects.toThrow();
  });
  it('accepts a real PDF header', async () => {
    const r = await saveUpload(file('good.pdf', Buffer.from('%PDF-1.4\n%%EOF'), 'application/pdf'));
    expect(r.sizeBytes).toBeGreaterThan(0);
    expect(r.storageKey).not.toContain('good');
  });
});

describe('passwords', () => {
  it('enforces length and mix', () => {
    expect(checkPasswordPolicy('short1')).toBeTruthy();
    expect(checkPasswordPolicy('onlyletterslongenough')).toBeTruthy();
    expect(checkPasswordPolicy('1234567890123')).toBeTruthy();
    expect(checkPasswordPolicy('a-good-passphrase-2026')).toBeNull();
  });
});

describe('content rendering', () => {
  it('removes scripts, event handlers and javascript: links from article markdown', () => {
    const html = renderMarkdown('# Hi\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1)) <img src=x onerror=alert(1)>');
    expect(html).not.toMatch(/<script|onerror|javascript:/i);
    expect(html).toContain('<h2'); // the page owns the only h1
  });
  it('slugifies', () => {
    expect(slugify('Bulk Supply & Solutions!')).toBe('bulk-supply-and-solutions');
  });
});
