'use client';

import Link from 'next/link';
import { useId, useState, useTransition } from 'react';
import { Icon } from './Icon';
import { addItemAction } from '@/app/(site)/list/actions';

export interface SizeOption { id: string; label: string; unit: string; sku: string | null; availability: string }

/** Add a product (and optionally a size and quantity) to the project list. The status message is announced to screen readers. */
export function AddToList({ productId, productName, sizes = [], compact = false }: { productId: string; productName: string; sizes?: SizeOption[]; compact?: boolean }) {
  const [variantId, setVariantId] = useState(sizes.length === 1 ? sizes[0]!.id : '');
  const [qty, setQty] = useState('1');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const uid = useId();
  const size = sizes.find((s) => s.id === variantId);

  function add() {
    const q = Number(qty.replace(/,/g, ''));
    if (!Number.isFinite(q) || q <= 0) { setMsg({ ok: false, text: 'Enter a quantity above zero.' }); return; }
    start(async () => {
      const r = await addItemAction({ productId, variantId: variantId || undefined, quantity: q });
      setMsg(r.ok ? { ok: true, text: `${productName}${size ? ` (${size.label})` : ''} added. ${r.view.count} ${r.view.count === 1 ? 'line' : 'lines'} on your list.` } : { ok: false, text: r.error });
    });
  }

  return (
    <div className={compact ? '' : 'panel panel-pad'}>
      <div className={`grid gap-3 ${compact ? 'grid-cols-[1fr_5.5rem]' : sizes.length > 1 ? 'sm:grid-cols-[1fr_7rem]' : 'grid-cols-[7rem]'}`}>
        {sizes.length > 1 && (
          <div>
            <label htmlFor={`${uid}-size`} className="label">Size or option</label>
            <select id={`${uid}-size`} className="select" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              <option value="">Not sure: ask me</option>
              {sizes.map((s) => <option key={s.id} value={s.id}>{s.label}{s.sku ? ` (${s.sku})` : ''}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={`${uid}-qty`} className="label">Quantity{size ? ` (${size.unit})` : ''}</label>
          <input id={`${uid}-qty`} className="input mono" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
      </div>
      <button type="button" className={`btn btn-primary mt-4 ${compact ? 'btn-sm w-full' : ''}`} onClick={add} disabled={pending} aria-disabled={pending}>
        <Icon name="plus" size={18} />{pending ? 'Adding…' : 'Add to project list'}
      </button>
      <p className={`mt-3 text-sm ${msg ? (msg.ok ? 'text-good' : 'text-ember') : 'sr-only'}`} role="status" aria-live="polite">
        {msg?.text}{msg?.ok && <> <Link href="/list" className="font-semibold">View list</Link></>}
      </p>
    </div>
  );
}

/** One-tap add for a "what we supply" line that is not a catalogue product yet. */
export function AddRangeLine({ label, categoryName }: { label: string; categoryName: string }) {
  const [state, setState] = useState<'idle' | 'added' | 'error'>('idle');
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={`group inline-flex items-center gap-2 border px-3 py-2 text-left text-[0.95rem] min-h-[2.75rem] transition-colors ${state === 'added' ? 'border-good bg-[#e6f1ea] text-[#1b4a34]' : 'border-line bg-white hover:border-charcoal'}`}
      disabled={pending}
      onClick={() => start(async () => { const r = await addItemAction({ label, unit: 'each', quantity: 1 }); setState(r.ok ? 'added' : 'error'); })}
      aria-label={`${state === 'added' ? 'Added: ' : 'Add to project list: '}${label} (${categoryName})`}
    >
      <Icon name={state === 'added' ? 'check' : 'plus'} size={16} />
      <span>{label}</span>
    </button>
  );
}
