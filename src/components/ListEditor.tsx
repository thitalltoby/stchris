'use client';

import Link from 'next/link';
import { useId, useState, useTransition } from 'react';
import { Icon } from './Icon';
import { addItemAction, removeItemAction, updateItemAction } from '@/app/(site)/list/actions';
import type { ListLine } from '@/server/project-list';

/**
 * The project list as an editable table. Every change is saved on the server straight away, so the list survives a
 * closed tab and follows the visitor to their account. `onChange` lets the request builder track the current lines.
 */
export function ListEditor({ initial, onChange, hideContinue = false }: { initial: ListLine[]; onChange?: (lines: ListLine[]) => void; hideContinue?: boolean }) {
  const [lines, setLines] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [pending, start] = useTransition();
  const uid = useId();
  const [free, setFree] = useState({ label: '', qty: '1', unit: 'each' });

  const apply = (next: ListLine[], say?: string) => { setLines(next); onChange?.(next); if (say) setStatus(say); };

  function save(id: string, patch: { quantity?: number; note?: string }) {
    setError(null);
    start(async () => {
      const r = await updateItemAction(id, patch);
      if (r.ok) apply(r.view.lines); else setError(r.error);
    });
  }
  function remove(l: ListLine) {
    setError(null);
    start(async () => {
      const r = await removeItemAction(l.id);
      if (r.ok) apply(r.view.lines, `${l.label} removed.`); else setError(r.error);
    });
  }
  function addFree(e: React.FormEvent) {
    e.preventDefault();
    const q = Number(free.qty.replace(/,/g, ''));
    if (free.label.trim().length < 2) { setError('Name the item you need.'); return; }
    if (!Number.isFinite(q) || q <= 0) { setError('Enter a quantity above zero.'); return; }
    setError(null);
    start(async () => {
      const r = await addItemAction({ label: free.label.trim(), unit: free.unit.trim() || 'each', quantity: q });
      if (r.ok) { apply(r.view.lines, `${free.label.trim()} added.`); setFree({ label: '', qty: '1', unit: 'each' }); } else setError(r.error);
    });
  }

  return (
    <div>
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
      {error && <div className="alert alert-error mb-4" role="alert">{error}</div>}

      {lines.length === 0 ? (
        <div className="panel panel-pad text-center py-12">
          <p className="font-display font-semibold text-xl">Your project list is empty</p>
          <p className="text-steel mt-2 max-w-md mx-auto">Browse the catalogue and add what you need, or describe an item below. You can build the list over several visits.</p>
          <Link href="/catalogue" className="btn btn-primary mt-6">Browse the catalogue <Icon name="arrow" size={18} /></Link>
        </div>
      ) : (
        <ul className="border-t-2 border-charcoal divide-y divide-line" aria-label="Lines on your project list">
          {lines.map((l) => (
            <li key={l.id} className="py-4 grid gap-x-4 gap-y-3 sm:grid-cols-[1fr_auto] items-start">
              <div className="min-w-0">
                <p className="font-display font-semibold text-[1.05rem] leading-snug">
                  {l.href ? <Link href={l.href} className="!text-charcoal no-underline hover:!text-ember">{l.label}</Link> : l.label}
                </p>
                {!l.productId && <p className="text-xs text-steel mt-0.5">Described by you. We will match it to a product when we quote.</p>}
                {l.unavailable && <p className="text-sm text-ember mt-1">This product is no longer in the catalogue. It stays on your list as a described item.</p>}
                <label className="sr-only" htmlFor={`${uid}-n-${l.id}`}>Note for {l.label}</label>
                <input
                  id={`${uid}-n-${l.id}`}
                  className="input mt-2 !min-h-[2.4rem] text-sm"
                  placeholder="Note (colour, finish, size, brand preference…)"
                  defaultValue={l.note ?? ''}
                  maxLength={500}
                  onBlur={(e) => { if ((e.target.value.trim() || '') !== (l.note ?? '')) save(l.id, { note: e.target.value }); }}
                />
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <label className="sr-only" htmlFor={`${uid}-q-${l.id}`}>Quantity of {l.label}</label>
                <input
                  id={`${uid}-q-${l.id}`}
                  className="input mono !w-24 text-right"
                  inputMode="decimal"
                  defaultValue={String(l.quantity)}
                  onBlur={(e) => {
                    const q = Number(e.target.value.replace(/,/g, ''));
                    if (!Number.isFinite(q) || q <= 0) { setError('Quantity must be more than zero.'); e.target.value = String(l.quantity); return; }
                    if (q !== l.quantity) save(l.id, { quantity: q });
                  }}
                />
                <span className="text-sm text-steel w-14 truncate" title={l.unit}>{l.unit}</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => remove(l)} disabled={pending} aria-label={`Remove ${l.label}`}><Icon name="x" size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addFree} className="mt-8 panel panel-pad" aria-label="Add an item that is not in the catalogue">
        <h2 className="!text-lg">Something we do not list?</h2>
        <p className="text-sm text-steel mt-1 mb-4">Describe it and add it. We source products beyond the catalogue.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_6rem_6rem_auto] items-end">
          <div><label htmlFor={`${uid}-fl`} className="label">Item</label><input id={`${uid}-fl`} className="input" value={free.label} maxLength={200} onChange={(e) => setFree({ ...free, label: e.target.value })} placeholder="e.g. 600 × 600 porcelain floor tile, grey" /></div>
          <div><label htmlFor={`${uid}-fq`} className="label">Quantity</label><input id={`${uid}-fq`} className="input mono" inputMode="decimal" value={free.qty} onChange={(e) => setFree({ ...free, qty: e.target.value })} /></div>
          <div><label htmlFor={`${uid}-fu`} className="label">Unit</label><input id={`${uid}-fu`} className="input" value={free.unit} maxLength={30} onChange={(e) => setFree({ ...free, unit: e.target.value })} /></div>
          <button type="submit" className="btn btn-dark" disabled={pending}><Icon name="plus" size={18} />Add</button>
        </div>
      </form>

      {!hideContinue && lines.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <p className="text-steel text-sm max-w-md">{lines.length} {lines.length === 1 ? 'line' : 'lines'}. Prices are not shown here: we confirm availability and price in a written quotation.</p>
          <Link href="/request?service=materials-quotation" className="btn btn-primary !min-h-[3.25rem] !px-8">Request a quotation <Icon name="arrow" size={18} /></Link>
        </div>
      )}
    </div>
  );
}
