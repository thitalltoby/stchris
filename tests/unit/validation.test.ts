import { describe, it, expect } from 'vitest';
import { validateDetails, requestSubmissionSchema, customerInfoSchema, type FieldDef } from '@/lib/validation';

const fields: FieldDef[] = [
  { key: 'capacity', label: 'Capacity required', type: 'NUMBER', required: true, unit: 'tonnes' },
  { key: 'product', label: 'Product', type: 'TEXT', required: true },
  { key: 'duration', label: 'Duration', type: 'SELECT', required: false, options: ['Short', 'Long'] },
  { key: 'needed', label: 'Needed by', type: 'DATE', required: false },
  { key: 'hazard', label: 'Hazardous', type: 'BOOLEAN', required: false },
];

describe('validateDetails', () => {
  it('accepts a complete, valid answer set and coerces numbers', () => {
    const r = validateDetails(fields, { capacity: '15000', product: 'Crude', duration: 'Short', needed: '2026-12-01', hazard: 'on' });
    expect(r.errors).toEqual({});
    expect(r.values).toMatchObject({ capacity: 15000, product: 'Crude', duration: 'Short', hazard: true });
  });
  it('reports required fields with the field label', () => {
    const r = validateDetails(fields, {});
    expect(r.errors.capacity).toBe('Capacity required is required.');
    expect(r.errors.product).toBe('Product is required.');
  });
  it('rejects non-numeric, negative and out-of-list answers', () => {
    expect(validateDetails(fields, { capacity: 'lots', product: 'x' }).errors.capacity).toBeTruthy();
    expect(validateDetails(fields, { capacity: '-5', product: 'x' }).errors.capacity).toBeTruthy();
    expect(validateDetails(fields, { capacity: '5', product: 'x', duration: 'Forever' }).errors.duration).toBeTruthy();
    expect(validateDetails(fields, { capacity: '5', product: 'x', needed: '31/12/2026' }).errors.needed).toBeTruthy();
  });
  it('ignores answers for fields that do not exist (no mass assignment)', () => {
    const r = validateDetails(fields, { capacity: '5', product: 'x', isAdmin: true, __proto__: { polluted: 1 } });
    expect(r.values).not.toHaveProperty('isAdmin');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('limits very long text', () => {
    expect(validateDetails(fields, { capacity: '5', product: 'x'.repeat(10000) }).errors.product).toBeTruthy();
  });
});

describe('request submission schema', () => {
  const base = { serviceId: 's', idempotencyKey: 'abcdefgh12', consent: true, customer: { name: 'Ada Okafor', email: ' ADA@Example.TEST ', phone: '+234 800 000 0001' } };
  it('normalises the email and accepts valid input', () => {
    const r = requestSubmissionSchema.parse(base);
    expect(r.customer.email).toBe('ada@example.test');
  });
  it('requires consent', () => {
    expect(requestSubmissionSchema.safeParse({ ...base, consent: false }).success).toBe(false);
  });
  it('rejects a filled honeypot', () => {
    expect(requestSubmissionSchema.safeParse({ ...base, website: 'http://spam' }).success).toBe(false);
  });
  it('rejects letters in phone numbers and bad emails', () => {
    expect(customerInfoSchema.safeParse({ ...base.customer, phone: 'call me' }).success).toBe(false);
    expect(customerInfoSchema.safeParse({ ...base.customer, email: 'nope' }).success).toBe(false);
  });
});
