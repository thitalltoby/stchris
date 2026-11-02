import { describe, it, expect } from 'vitest';
import { base32Encode, base32Decode, totpCode, matchTotp, totpStep, otpauthUrl } from '@/server/mfa';

// RFC 6238 appendix B test secret: ASCII "12345678901234567890"
const SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('encodes base32 like the RFC examples', () => {
    expect(SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(SECRET).toString()).toBe('12345678901234567890');
    expect(base32Decode('gezd gnbv-gy3t')).toEqual(base32Decode('GEZDGNBVGY3T'));
  });

  it('matches the RFC 6238 SHA-1 vectors (last six digits)', () => {
    const vectors: Array<[number, string]> = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']];
    for (const [t, code] of vectors) expect(totpCode(SECRET, Math.floor(t / 30))).toBe(code);
  });

  it('accepts one step either side and nothing further', () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    expect(matchTotp(SECRET, totpCode(SECRET, step), now)).toBe(step);
    expect(matchTotp(SECRET, totpCode(SECRET, step - 1), now)).toBe(step - 1);
    expect(matchTotp(SECRET, totpCode(SECRET, step + 1), now)).toBe(step + 1);
    expect(matchTotp(SECRET, totpCode(SECRET, step - 2), now)).toBeNull();
    expect(matchTotp(SECRET, totpCode(SECRET, step + 2), now)).toBeNull();
  });

  it('rejects malformed input', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 34 5x']) expect(matchTotp(SECRET, bad)).toBeNull();
  });

  it('builds an otpauth URL authenticator apps understand', () => {
    const u = new URL(otpauthUrl('a.b@example.com', SECRET));
    expect(u.protocol).toBe('otpauth:');
    expect(u.hostname).toBe('totp');
    expect(u.searchParams.get('secret')).toBe(SECRET);
    expect(u.searchParams.get('issuer')).toBe('St. Chris Materials Desk');
    expect(u.searchParams.get('digits')).toBe('6');
    expect(u.searchParams.get('period')).toBe('30');
  });
});
