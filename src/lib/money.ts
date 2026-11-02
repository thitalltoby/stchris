import Decimal from 'decimal.js';

export interface LineInput {
  description: string;
  unit: string;
  quantity: string | number;
  unitPrice: string | number;
  discountPercent?: string | number;
  taxPercent?: string | number;
}

export interface ComputedLine extends LineInput {
  lineGross: string;
  lineDiscount: string;
  lineNet: string;
  lineTax: string;
  lineTotal: string;
}

export interface QuoteTotals {
  lines: ComputedLine[];
  subtotal: string; // sum of quantity × price (before discount)
  discountTotal: string;
  net: string; // subtotal − discounts
  taxTotal: string;
  total: string;
}

const D = (v: string | number | undefined | null) => new Decimal(v === undefined || v === null || v === '' ? 0 : v);
const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 * Deterministic quotation arithmetic. Every line is rounded to 2 decimal places (half-up) before
 * totals are summed, so the printed lines always add up to the printed totals.
 *   gross = quantity × unit price
 *   discount = gross × discount%
 *   net = gross − discount
 *   tax = net × tax%
 */
export function computeQuote(input: LineInput[]): QuoteTotals {
  let subtotal = new Decimal(0);
  let discountTotal = new Decimal(0);
  let taxTotal = new Decimal(0);
  const lines: ComputedLine[] = input.map((l) => {
    const gross = r2(D(l.quantity).mul(D(l.unitPrice)));
    const discount = r2(gross.mul(D(l.discountPercent)).div(100));
    const net = gross.minus(discount);
    const tax = r2(net.mul(D(l.taxPercent)).div(100));
    subtotal = subtotal.plus(gross);
    discountTotal = discountTotal.plus(discount);
    taxTotal = taxTotal.plus(tax);
    return {
      ...l,
      lineGross: gross.toFixed(2),
      lineDiscount: discount.toFixed(2),
      lineNet: net.toFixed(2),
      lineTax: tax.toFixed(2),
      lineTotal: net.plus(tax).toFixed(2),
    };
  });
  const net = subtotal.minus(discountTotal);
  return {
    lines,
    subtotal: subtotal.toFixed(2),
    discountTotal: discountTotal.toFixed(2),
    net: net.toFixed(2),
    taxTotal: taxTotal.toFixed(2),
    total: net.plus(taxTotal).toFixed(2),
  };
}

export function formatMoney(value: string | number | { toString(): string } | null | undefined, currency = 'NGN'): string {
  if (value === null || value === undefined) return '—';
  const n = Number(value.toString());
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, currencyDisplay: currency === 'NGN' ? 'narrowSymbol' : 'symbol', minimumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
