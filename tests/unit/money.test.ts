import { describe, it, expect } from 'vitest';
import { computeQuote, formatMoney } from '@/lib/money';

describe('computeQuote', () => {
  it('computes gross, discount, tax and total per line', () => {
    const q = computeQuote([{ description: 'Storage', unit: 'tonne', quantity: 2, unitPrice: 500000, discountPercent: 10, taxPercent: 7.5 }]);
    expect(q.lines[0]).toMatchObject({ lineGross: '1000000.00', lineDiscount: '100000.00', lineNet: '900000.00', lineTax: '67500.00', lineTotal: '967500.00' });
    expect(q.total).toBe('967500.00');
  });

  it('avoids floating-point drift', () => {
    const q = computeQuote([{ description: 'x', unit: 'each', quantity: 3, unitPrice: '0.10' }]);
    expect(q.total).toBe('0.30');
  });

  it('rounds each line half-up so printed lines add up to printed totals', () => {
    const lines = Array.from({ length: 3 }, () => ({ description: 'x', unit: 'each', quantity: 1, unitPrice: '10.005', taxPercent: 0 }));
    const q = computeQuote(lines);
    expect(q.lines.map((l) => l.lineNet)).toEqual(['10.01', '10.01', '10.01']);
    expect(q.total).toBe('30.03');
    const sum = q.lines.reduce((n, l) => n + Number(l.lineTotal), 0);
    expect(sum.toFixed(2)).toBe(q.total);
  });

  it('treats blank optional percentages as zero and handles an empty quotation', () => {
    expect(computeQuote([{ description: 'x', unit: 'each', quantity: 1, unitPrice: 100, discountPercent: '', taxPercent: undefined }]).total).toBe('100.00');
    expect(computeQuote([]).total).toBe('0.00');
  });

  it('keeps large naira amounts exact', () => {
    const q = computeQuote([{ description: 'x', unit: 'each', quantity: 1, unitPrice: '12345678901.23', taxPercent: 7.5 }]);
    expect(q.taxTotal).toBe('925925917.59');
    expect(q.total).toBe('13271604818.82');
  });
});

describe('formatMoney', () => {
  it('formats NGN with the naira sign and two decimals', () => {
    expect(formatMoney('1000000')).toBe('₦1,000,000.00');
  });
  it('shows a dash for missing values and survives unknown currencies', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney('5', 'XXX')).toContain('5.00');
  });
});
