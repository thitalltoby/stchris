'use client';

import { createContext, useActionState, useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { FormState } from '@/server/action-utils';

const Ctx = createContext<FormState>(null);

export function ActionForm({ action, children, className = '', resetOnSuccess = false, hideBanner = false, id, encType }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>; children: ReactNode; className?: string; resetOnSuccess?: boolean; hideBanner?: boolean; id?: string; encType?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state) return;
    if (state.ok && resetOnSuccess) ref.current?.reset();
    banner.current?.focus();
    if (!state.ok) setTimeout(() => (ref.current?.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus(), 30);
  }, [state, resetOnSuccess]);
  return (
    <Ctx.Provider value={state}>
      <form ref={ref} action={formAction} className={className} id={id} encType={encType} noValidate={false}>
        {!hideBanner && state && (state.error || state.message) && (
          <div ref={banner} tabIndex={-1} className={`alert ${state.ok ? 'alert-ok' : 'alert-error'} mb-4 outline-none whitespace-pre-line`} role={state.ok ? 'status' : 'alert'}>{state.ok ? state.message : state.error}</div>
        )}
        {children}
      </form>
    </Ctx.Provider>
  );
}

export function SubmitButton({ children, pending: pendingLabel = 'Working…', className = 'btn btn-primary', name, value }: { children: ReactNode; pending?: string; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" name={name} value={value} className={className} disabled={pending} aria-disabled={pending}>{pending ? pendingLabel : children}</button>;
}

type Opt = { value: string; label: string };
export interface FieldProps {
  name: string; label: string; type?: 'text' | 'email' | 'password' | 'tel' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox' | 'file' | 'datetime-local';
  defaultValue?: string | number | boolean | null; required?: boolean; hint?: ReactNode; options?: Opt[]; placeholder?: string; autoComplete?: string;
  rows?: number; min?: string | number; max?: string | number; step?: string | number; className?: string; accept?: string; multiple?: boolean; readOnly?: boolean; disabled?: boolean; maxLength?: number; inputMode?: 'numeric' | 'decimal' | 'text';
}

export function Field({ name, label, type = 'text', defaultValue, required, hint, options, className = '', rows = 4, ...rest }: FieldProps) {
  const state = useContext(Ctx);
  const error = state?.fields?.[name];
  // unique per field instance: the same form (e.g. one per service field) can appear many times on a page
  const id = `fld-${name}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const described = [error ? `${id}-err` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined;
  const common = { id, name, required, 'aria-invalid': error ? (true as const) : undefined, 'aria-describedby': described, ...rest };
  if (type === 'checkbox') {
    return (
      <div className={className}>
        <label className="check"><input type="checkbox" {...common} defaultChecked={!!defaultValue} /><span>{label}</span></label>
        {hint && <p id={`${id}-hint`} className="hint">{hint}</p>}
        {error && <p id={`${id}-err`} className="field-error">{error}</p>}
      </div>
    );
  }
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}{required && <span className="req" aria-hidden="true">*</span>}{required && <span className="sr-only"> (required)</span>}</label>
      {type === 'textarea' ? <textarea {...common} rows={rows} className="textarea" defaultValue={(defaultValue as string) ?? ''} />
        : type === 'select' ? <select {...common} className="select" defaultValue={(defaultValue as string) ?? ''}>{options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : type === 'file' ? <input {...common} type="file" className="input !py-2" />
        : <input {...common} type={type} className="input" defaultValue={defaultValue === null || defaultValue === undefined ? '' : String(defaultValue)} />}
      {hint && <p id={`${id}-hint`} className="hint">{hint}</p>}
      {error && <p id={`${id}-err`} className="field-error">{error}</p>}
    </div>
  );
}

/** A plain mutation button (no inputs) bound to a server action, e.g. "Mark done" or "Withdraw". */
export function ActionButton({ action, children, className = 'btn btn-outline btn-sm', hidden }: { action: (prev: FormState, fd: FormData) => Promise<FormState>; children: ReactNode; className?: string; hidden?: Record<string, string> }) {
  return (
    <ActionForm action={action} className="inline">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton className={className}>{children}</SubmitButton>
    </ActionForm>
  );
}
