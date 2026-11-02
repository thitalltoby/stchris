'use client';

import { useMemo, useState } from 'react';
import { ActionForm, SubmitButton, Field } from './ActionForm';
import { computeQuote, formatMoney } from '@/lib/money';
import type { FormState } from '@/server/action-utils';

export interface EditorLine { description: string; unit: string; quantity: string; unitPrice: string; discountPercent: string; taxPercent: string; productId?: string | null; variantId?: string | null; sku?: string | null }
export interface EditorProps {
  quotationId: string; revisionId: string; currency: string;
  initial: { title: string; introduction: string; terms: string; paymentTerms: string; validityDays: number; lines: EditorLine[] };
  taxRates: { label: string; percent: number }[]; defaultTax: number; canSubmit: boolean;
  saveAction: (p: FormState, fd: FormData) => Promise<FormState>;
}

const blank = (tax: number): EditorLine => ({ description: '', unit: 'each', quantity: '1', unitPrice: '0', discountPercent: '0', taxPercent: String(tax) });

export function QuoteEditor(p: EditorProps) {
  const [lines, setLines] = useState<EditorLine[]>(p.initial.lines.length ? p.initial.lines : [blank(p.defaultTax)]);
  const totals = useMemo(() => computeQuote(lines.map((l) => ({ ...l, quantity: l.quantity || 0, unitPrice: l.unitPrice || 0 }))), [lines]);
  const set = (i: number, k: keyof EditorLine, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const money = (v: string) => formatMoney(v, p.currency);
  return (
    <ActionForm action={p.saveAction} className="space-y-6">
      <input type="hidden" name="quotationId" value={p.quotationId} />
      <input type="hidden" name="revisionId" value={p.revisionId} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" name="title" label="Title" defaultValue={p.initial.title} />
        <Field name="currency" label="Currency (3-letter code)" defaultValue={p.currency} maxLength={3} />
        <Field name="validityDays" type="number" label="Valid for (days)" defaultValue={p.initial.validityDays} min={1} max={365} />
        <Field className="sm:col-span-2" name="introduction" type="textarea" label="Introduction" defaultValue={p.initial.introduction} rows={3} />
      </div>

      <fieldset>
        <legend className="eyebrow mb-3 w-full border-b border-line pb-2">Line items</legend>
        {lines.some((l) => Number(l.unitPrice) === 0) && <p className="alert alert-warn mb-4" role="status">Some lines have no price yet. Prices come from the internal price book where one is set; check every line before you submit.</p>}
        <div className="space-y-4">
          {lines.map((l, i) => {
            const c = totals.lines[i]!;
            return (
              <div key={i} className="border border-line bg-white p-3">
                <div className="grid gap-3 md:grid-cols-[1fr_6rem_7rem_9rem_6rem_9rem]">
                  <div><label className="label" htmlFor={`d${i}`}>Description</label><input id={`d${i}`} className="input" value={l.description} onChange={(e) => set(i, 'description', e.target.value)} /></div>
                  <div><label className="label" htmlFor={`u${i}`}>Unit</label><input id={`u${i}`} className="input" value={l.unit} onChange={(e) => set(i, 'unit', e.target.value)} /></div>
                  <div><label className="label" htmlFor={`q${i}`}>Quantity</label><input id={`q${i}`} className="input mono" inputMode="decimal" value={l.quantity} onChange={(e) => set(i, 'quantity', e.target.value)} /></div>
                  <div><label className="label" htmlFor={`p${i}`}>Unit price</label><input id={`p${i}`} className="input mono" inputMode="decimal" value={l.unitPrice} onChange={(e) => set(i, 'unitPrice', e.target.value)} /></div>
                  <div><label className="label" htmlFor={`x${i}`}>Disc. %</label><input id={`x${i}`} className="input mono" inputMode="decimal" value={l.discountPercent} onChange={(e) => set(i, 'discountPercent', e.target.value)} /></div>
                  <div><label className="label" htmlFor={`t${i}`}>Tax</label>
                    <select id={`t${i}`} className="select" value={l.taxPercent} onChange={(e) => set(i, 'taxPercent', e.target.value)}>
                      {[...new Set([...p.taxRates.map((r) => r.percent), Number(l.taxPercent)])].sort((a, b) => a - b).map((pc) => <option key={pc} value={pc}>{p.taxRates.find((r) => r.percent === pc)?.label ?? `${pc}%`}{pc ? ` (${pc}%)` : ''}</option>)}
                    </select></div>
                </div>
                <div className="mt-2 flex justify-between items-center text-sm">
                  <button type="button" className="text-ember underline" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1}>Remove line {i + 1}</button>
                  <span className="mono">Line total {money(c.lineTotal)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => setLines((ls) => [...ls, blank(p.defaultTax)])}>Add line</button>
      </fieldset>

      <dl className="ml-auto max-w-sm grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 mono text-sm" aria-live="polite">
        <dt>Subtotal</dt><dd className="text-right">{money(totals.subtotal)}</dd>
        <dt>Discounts</dt><dd className="text-right">−{money(totals.discountTotal)}</dd>
        <dt>Tax</dt><dd className="text-right">{money(totals.taxTotal)}</dd>
        <dt className="font-bold text-base border-t-2 border-charcoal pt-1">Total</dt><dd className="font-bold text-base text-right border-t-2 border-charcoal pt-1">{money(totals.total)}</dd>
      </dl>
      <p className="hint text-right">Totals are recalculated and stored by the server when you save.</p>

      <div className="grid gap-4">
        <Field name="paymentTerms" type="textarea" label="Payment terms" defaultValue={p.initial.paymentTerms} rows={3} hint="Leave blank if payment terms are not agreed yet; nothing is invented for you." />
        <Field name="terms" type="textarea" label="Terms and conditions" defaultValue={p.initial.terms} rows={5} />
      </div>
      <div className="flex flex-wrap gap-3 border-t border-line pt-5">
        <SubmitButton className="btn btn-outline">Save draft</SubmitButton>
        {p.canSubmit && <SubmitButton className="btn btn-primary" name="__submit" value="1">Save and submit for approval</SubmitButton>}
      </div>
    </ActionForm>
  );
}
