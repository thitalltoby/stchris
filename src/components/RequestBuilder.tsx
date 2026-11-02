'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { ACCEPT_ATTR, ALLOWED_LABEL, MAX_FILE_BYTES, MAX_FILES_PER_UPLOAD } from '@/lib/upload-rules';
import { fmtBytes } from '@/lib/format';
import type { FieldDef } from '@/lib/validation';
import type { ListLine } from '@/server/project-list';
import { ListEditor } from './ListEditor';

export interface BuilderService { id: string; slug: string; name: string; pillar: string; summary: string; instructions: string | null; icon: string; acceptsItems: boolean; fields: FieldDef[] }
export interface Prefill { name: string; email: string; phone: string; companyName: string; jobTitle: string }

type Details = Record<string, string | boolean>;
type StepKey = 'type' | 'items' | 'details' | 'you' | 'review';
const STEP_LABEL: Record<StepKey, string> = { type: 'How you are buying', items: 'Your list', details: 'Project details', you: 'About you', review: 'Review' };

function uuid() {
  try { return crypto.randomUUID(); } catch { return `k${Date.now()}${Math.random().toString(36).slice(2)}`; }
}

function checkField(f: FieldDef, v: string | boolean | undefined): string | null {
  const empty = v === undefined || v === '' || v === false;
  if (f.type === 'BOOLEAN') return f.required && !v ? `${f.label} is required.` : null;
  if (empty || (typeof v === 'string' && v.trim() === '')) return f.required ? `${f.label} is required.` : null;
  const s = String(v);
  if (f.type === 'NUMBER') { const n = Number(s.replace(/,/g, '')); if (!Number.isFinite(n) || n < 0) return `${f.label} must be a positive number.`; }
  if (f.type === 'TEXT' && s.length > 500) return `${f.label} must be 500 characters or fewer.`;
  if (f.type === 'TEXTAREA' && s.length > 4000) return `${f.label} must be 4,000 characters or fewer.`;
  return null;
}

export function RequestBuilder({ services, prefill, initialSlug, initialDetails, repeatOfId, signedIn, listLines, channels = { sms: false, whatsapp: false } }: {
  services: BuilderService[]; prefill: Prefill | null; listLines: ListLine[]; initialSlug?: string; initialDetails?: Details; repeatOfId?: string; signedIn: boolean;
  /** Which message channels St. Chris has switched on; the opt-in boxes only appear for those */
  channels?: { sms: boolean; whatsapp: boolean };
}) {
  const initial = services.find((s) => s.slug === initialSlug) ?? null;
  const [step, setStep] = useState(initial ? 1 : 0);
  const [lines, setLines] = useState<ListLine[]>(listLines);
  const [serviceId, setServiceId] = useState<string | null>(initial?.id ?? null);
  const [details, setDetails] = useState<Details>(initialDetails ?? {});
  const [recurrence, setRecurrence] = useState<'ONE_OFF' | 'RECURRING'>('ONE_OFF');
  const [files, setFiles] = useState<File[]>([]);
  const [customer, setCustomer] = useState<Prefill>(prefill ?? { name: '', email: '', phone: '', companyName: '', jobTitle: '' });
  const [consent, setConsent] = useState(false);
  const [messaging, setMessaging] = useState({ sms: false, whatsapp: false });
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const key = useRef(uuid());
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  const service = useMemo(() => services.find((s) => s.id === serviceId) ?? null, [services, serviceId]);
  const keys: StepKey[] = useMemo(() => (service?.acceptsItems ? ['type', 'items', 'details', 'you', 'review'] : ['type', 'details', 'you', 'review']), [service]);
  const cur: StepKey = keys[Math.min(step, keys.length - 1)]!;
  const go = (k: StepKey) => setStep(Math.max(0, keys.indexOf(k)));
  const sections = useMemo(() => {
    const out: { name: string; fields: FieldDef[] }[] = [];
    for (const f of service?.fields ?? []) {
      const n = f.section ?? 'Requirement';
      let g = out.find((x) => x.name === n);
      if (!g) out.push((g = { name: n, fields: [] }));
      g.fields.push(f);
    }
    return out;
  }, [service]);

  // Restore an unsent draft (details only, never files) for this browser tab session.
  // This must run after hydration (sessionStorage does not exist on the server), so setState in an effect is intentional.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (initialDetails || initial) return;
    try {
      const raw = sessionStorage.getItem('stchris-request-draft');
      if (raw) {
        const d = JSON.parse(raw);
        if (d.serviceId && services.some((s) => s.id === d.serviceId)) { setServiceId(d.serviceId); setDetails(d.details ?? {}); if (d.step > 0) setStep(Math.min(d.step, 4)); }
        if (!prefill && d.customer) setCustomer((c) => ({ ...c, ...d.customer }));
      }
    } catch { /* storage unavailable: the form still works */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    try { sessionStorage.setItem('stchris-request-draft', JSON.stringify({ serviceId, details, step: cur === 'review' ? Math.max(0, keys.indexOf('you')) : step, customer: prefill ? undefined : customer })); } catch { /* ignore */ }
  }, [serviceId, details, step, customer, prefill, cur, keys]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    heading.current?.focus();
    window.scrollTo({ top: Math.max(0, (heading.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 140), behavior: 'smooth' });
  }, [step]);

  const setD = (k: string, v: string | boolean) => { setDetails((d) => ({ ...d, [k]: v })); setErrors((e) => { if (!e[`details.${k}`]) return e; const n = { ...e }; delete n[`details.${k}`]; return n; }); };
  const setC = (k: keyof Prefill, v: string) => { setCustomer((c) => ({ ...c, [k]: v })); setErrors((e) => { if (!e[`customer.${k}`]) return e; const n = { ...e }; delete n[`customer.${k}`]; return n; }); };

  function validateStep(s: StepKey): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 'type' && !service) e.service = 'Choose how you are buying to continue.';
    if (s === 'items' && service?.acceptsItems && lines.length === 0 && files.length === 0) e.items = 'Add at least one item to your list, or attach a bill of quantities in the next step.';
    if (s === 'details' && service) for (const f of service.fields) { const m = checkField(f, details[f.key]); if (m) e[`details.${f.key}`] = m; }
    if (s === 'you') {
      if (customer.name.trim().length < 2) e['customer.name'] = 'Enter your full name.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) e['customer.email'] = 'Enter a valid email address.';
      if (customer.phone.trim().length < 6 || !/^[0-9+()\-\s.]+$/.test(customer.phone.trim())) e['customer.phone'] = 'Enter a phone number we can reach you on (digits, spaces, + ( ) - only).';
    }
    return e;
  }

  function next() {
    const e = validateStep(cur);
    setErrors(e);
    if (Object.keys(e).length) { setBanner('Please fix the highlighted fields before continuing.'); focusFirstError(); return; }
    setBanner(null);
    setStep(step + 1);
  }
  function back() { setErrors({}); setBanner(null); setStep(Math.max(0, step - 1)); }
  const itemsPayload = () => lines.map((l) => ({ productId: l.productId, variantId: l.variantId, label: l.label, unit: l.unit, quantity: l.quantity, note: l.note ?? '' }));
  function focusFirstError() { setTimeout(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus(), 30); }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const problems: string[] = [];
    const ok = [...files];
    for (const f of Array.from(list)) {
      const ext = f.name.includes('.') ? f.name.split('.').pop()!.toLowerCase() : '';
      if (!ACCEPT_ATTR.includes(`.${ext}`) || !ext) problems.push(`“${f.name}” is not an accepted file type.`);
      else if (f.size > MAX_FILE_BYTES) problems.push(`“${f.name}” is larger than 10 MB (${fmtBytes(f.size)}).`);
      else if (f.size === 0) problems.push(`“${f.name}” is empty.`);
      else if (ok.length >= MAX_FILES_PER_UPLOAD) problems.push(`You can attach at most ${MAX_FILES_PER_UPLOAD} files.`);
      else ok.push(f);
    }
    setFiles(ok);
    setErrors((e) => { const n = { ...e }; if (problems.length) n.files = [...new Set(problems)].join(' '); else delete n.files; return n; });
  }

  function submit() {
    const e = { ...validateStep('items'), ...validateStep('details'), ...validateStep('you') };
    if (!consent) e.consent = 'Please confirm you have read the privacy notice.';
    if (Object.keys(e).length) {
      setErrors(e);
      setBanner('Some answers need attention. Go back to the highlighted step to fix them.');
      if (e.items) go('items'); else if (Object.keys(e).some((k) => k.startsWith('details.'))) go('details'); else if (Object.keys(e).some((k) => k.startsWith('customer.'))) go('you');
      return;
    }
    setBusy(true); setBanner(null); setErrors({}); setProgress(0);
    const fd = new FormData();
    fd.set('payload', JSON.stringify({ serviceId, details, recurrence, items: service?.acceptsItems ? itemsPayload() : [], customer, idempotencyKey: key.current, website, consent: true, messaging: { sms: channels.sms && messaging.sms, whatsapp: channels.whatsapp && messaging.whatsapp } }));
    if (repeatOfId) fd.set('repeatOfId', repeatOfId);
    files.forEach((f) => fd.append('files', f));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/requests');
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100)); };
    xhr.onerror = () => { setBusy(false); setProgress(null); setBanner('We could not reach the server. Your answers are still here: check your connection and try again.'); };
    xhr.ontimeout = xhr.onerror;
    xhr.timeout = 180_000;
    xhr.onload = () => {
      let r: { ok: boolean; error?: string; fields?: Record<string, string>; redirect?: string } = { ok: false };
      try { r = JSON.parse(xhr.responseText); } catch { /* fall through */ }
      if (r.ok && r.redirect) {
        try { sessionStorage.removeItem('stchris-request-draft'); } catch { /* ignore */ }
        window.location.assign(r.redirect);
        return;
      }
      setBusy(false); setProgress(null);
      setBanner(r.error ?? 'Something went wrong. Please try again.');
      if (r.fields && Object.keys(r.fields).length) {
        setErrors(r.fields);
        if (r.fields.items) go('items'); else if (Object.keys(r.fields).some((k) => k.startsWith('details.'))) go('details'); else if (Object.keys(r.fields).some((k) => k.startsWith('customer.'))) go('you');
      }
    };
    xhr.send(fd);
  }

  const err = (k: string) => errors[k];
  const errId = (k: string) => `err-${k.replace(/\./g, '-')}`;

  return (
    <div>
      <nav aria-label="Progress" className="mb-8">
        <ol className="grid gap-1 sm:gap-2" style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}>
          {keys.map((k, i) => {
            const s = STEP_LABEL[k];
            const state = i < step ? 'done' : i === step ? 'current' : 'todo';
            return (
              <li key={s} aria-current={state === 'current' ? 'step' : undefined} className={`border-t-4 pt-2 ${state === 'todo' ? 'border-line' : 'border-ember'}`}>
                <p className={`mono text-[0.7rem] sm:text-xs ${state === 'todo' ? 'text-steel' : 'text-ember'}`}>0{i + 1}</p>
                <p className={`font-display font-bold text-sm sm:text-base leading-tight ${state === 'todo' ? 'text-steel' : ''}`}>{s}<span className="sr-only">{state === 'done' ? ' (completed)' : state === 'current' ? ' (current step)' : ''}</span></p>
              </li>
            );
          })}
        </ol>
      </nav>

      {banner && <div className="alert alert-error mb-6" role="alert">{banner}</div>}

      {cur === 'type' && (
        <section aria-labelledby="h-step">
          <h2 id="h-step" ref={heading} tabIndex={-1} className="mb-2 outline-none">How are you buying?</h2>
          <p className="text-steel mb-6">Choose the route that fits. You can change it before you send.</p>
          <fieldset>
            <legend className="sr-only">How you are buying</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {services.map((s) => (
                <label key={s.id} className={`panel p-4 cursor-pointer flex gap-3 items-start transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-brand ${serviceId === s.id ? '!border-ember bg-white ring-2 ring-ember' : 'hover:border-steel'}`}>
                  <input type="radio" name="service" value={s.id} checked={serviceId === s.id} onChange={() => { setServiceId(s.id); setDetails({}); setErrors({}); }} className="mt-1.5 accent-[#b4430a] h-4 w-4 flex-none" />
                  <span>
                    <span className="eyebrow flex items-center gap-1.5"><Icon name={s.icon} size={14} />{s.pillar}</span>
                    <span className="block font-display font-bold text-lg leading-snug mt-1">{s.name}</span>
                    <span className="block text-sm text-steel mt-1">{s.summary}</span>
                  </span>
                </label>
              ))}
            </div>
            {err('service') && <p className="field-error mt-3">{err('service')}</p>}
          </fieldset>
        </section>
      )}

      {cur === 'items' && service && (
        <section aria-labelledby="h-step">
          <h2 id="h-step" ref={heading} tabIndex={-1} className="mb-2 outline-none">Check your list</h2>
          <p className="text-steel mb-6 max-w-2xl">These are the items we will quote. Change quantities, add notes, or add anything we do not list. Changes save as you make them.</p>
          {err('items') && <div className="alert alert-error mb-4" role="alert">{err('items')}</div>}
          <ListEditor initial={lines} onChange={setLines} hideContinue />
          <p className="mt-4 text-sm"><Link href="/catalogue" className="link-arrow !text-sm">Browse the catalogue for more <Icon name="arrow" size={16} /></Link></p>
        </section>
      )}

      {cur === 'details' && service && (
        <section aria-labelledby="h-step">
          <h2 id="h-step" ref={heading} tabIndex={-1} className="mb-2 outline-none">{service.acceptsItems ? 'Project details' : 'Describe what you need'}</h2>
          <p className="text-steel mb-1"><strong className="text-charcoal">{service.name}</strong> · <button type="button" className="underline text-ember" onClick={() => go('type')}>change</button></p>
          {service.instructions && <p className="text-steel mb-6 max-w-2xl">{service.instructions}</p>}
          <p className="text-sm text-steel mb-6"><span className="req">*</span> marks required questions.</p>
          <div className="space-y-10">
            {sections.map((g) => (
              <fieldset key={g.name}>
                <legend className="eyebrow mb-4 w-full border-b border-line pb-2">{g.name}</legend>
                <div className="grid gap-5 sm:grid-cols-2">
                  {g.fields.map((f) => {
                    const k = `details.${f.key}`;
                    const common = { id: `f-${f.key}`, 'aria-invalid': !!err(k) || undefined, 'aria-describedby': [err(k) ? errId(k) : '', f.helpText ? `h-${f.key}` : ''].filter(Boolean).join(' ') || undefined } as const;
                    const wide = f.type === 'TEXTAREA';
                    return (
                      <div key={f.key} className={wide ? 'sm:col-span-2' : ''}>
                        {f.type === 'BOOLEAN' ? (
                          <label className="check"><input type="checkbox" {...common} checked={details[f.key] === true} onChange={(e) => setD(f.key, e.target.checked)} /><span>{f.label}{f.required && <span className="req" aria-hidden="true">*</span>}</span></label>
                        ) : (
                          <>
                            <label htmlFor={`f-${f.key}`} className="label">{f.label}{f.required && <span className="req" aria-hidden="true">*</span>}{f.required && <span className="sr-only"> (required)</span>}{f.unit && f.type === 'NUMBER' ? <span className="text-steel font-normal"> ({f.unit})</span> : null}</label>
                            {f.type === 'TEXTAREA' ? <textarea {...common} className="textarea" value={String(details[f.key] ?? '')} placeholder={f.placeholder ?? undefined} onChange={(e) => setD(f.key, e.target.value)} />
                              : f.type === 'SELECT' ? <select {...common} className="select" value={String(details[f.key] ?? '')} onChange={(e) => setD(f.key, e.target.value)}><option value="">Select…</option>{(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
                              : f.type === 'DATE' ? <input {...common} type="date" className="input" value={String(details[f.key] ?? '')} onChange={(e) => setD(f.key, e.target.value)} />
                              : f.type === 'NUMBER' ? <input {...common} type="text" inputMode="decimal" className="input mono" value={String(details[f.key] ?? '')} placeholder={f.placeholder ?? undefined} onChange={(e) => setD(f.key, e.target.value)} />
                              : <input {...common} type="text" className="input" value={String(details[f.key] ?? '')} placeholder={f.placeholder ?? undefined} onChange={(e) => setD(f.key, e.target.value)} />}
                          </>
                        )}
                        {f.helpText && <p id={`h-${f.key}`} className="hint">{f.helpText}</p>}
                        {err(k) && <p id={errId(k)} className="field-error">{err(k)}</p>}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <fieldset>
              <legend className="eyebrow mb-4 w-full border-b border-line pb-2">Frequency</legend>
              <div className="flex flex-wrap gap-6">
                {(['ONE_OFF', 'RECURRING'] as const).map((r) => (
                  <label key={r} className="check"><input type="radio" name="recurrence" checked={recurrence === r} onChange={() => setRecurrence(r)} /><span>{r === 'ONE_OFF' ? 'One-off requirement' : 'Recurring requirement'}</span></label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="eyebrow mb-4 w-full border-b border-line pb-2">Documents (optional)</legend>
              <label htmlFor="f-files" className="label">{service.acceptsItems ? 'Attach a bill of quantities, drawings or a schedule' : 'Attach a photo, datasheet or any supporting file'}</label>
              <input id="f-files" type="file" multiple accept={ACCEPT_ATTR} className="input !py-2" aria-describedby="files-hint" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              <p id="files-hint" className="hint">{ALLOWED_LABEL}. Files are stored privately.</p>
              {err('files') && <p className="field-error" role="alert">{err('files')}</p>}
              {files.length > 0 && (
                <ul className="mt-3 divide-y divide-line border border-line bg-white">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2 min-w-0"><Icon name="file" size={16} /><span className="truncate">{f.name}</span><span className="mono text-steel flex-none">{fmtBytes(f.size)}</span></span>
                      <button type="button" className="text-ember underline flex-none" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove<span className="sr-only"> {f.name}</span></button>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          </div>
        </section>
      )}

      {cur === 'you' && (
        <section aria-labelledby="h-step">
          <h2 id="h-step" ref={heading} tabIndex={-1} className="mb-2 outline-none">Your details</h2>
          <p className="text-steel mb-6 max-w-2xl">{signedIn ? 'These come from your account. You can adjust them for this request.' : 'So the team can reach you. You do not need an account.'}</p>
          <div className="grid gap-5 sm:grid-cols-2">
            {([['name', 'Full name', 'text', true, 'name'], ['email', 'Email address', 'email', true, 'email'], ['phone', 'Phone number', 'tel', true, 'tel'], ['companyName', 'Company', 'text', false, 'organization'], ['jobTitle', 'Job title', 'text', false, 'organization-title']] as const).map(([k, label, type, req, ac]) => (
              <div key={k}>
                <label htmlFor={`c-${k}`} className="label">{label}{req && <span className="req" aria-hidden="true">*</span>}{req && <span className="sr-only"> (required)</span>}</label>
                <input id={`c-${k}`} type={type} autoComplete={ac} className="input" value={customer[k]} aria-invalid={!!err(`customer.${k}`) || undefined} aria-describedby={err(`customer.${k}`) ? errId(`customer.${k}`) : undefined} onChange={(e) => setC(k, e.target.value)} />
                {err(`customer.${k}`) && <p id={errId(`customer.${k}`)} className="field-error">{err(`customer.${k}`)}</p>}
              </div>
            ))}
          </div>
          {(channels.sms || channels.whatsapp) && (
            <fieldset className="mt-8 max-w-2xl">
              <legend className="label">Status messages (optional)</legend>
              <p className="hint mb-3">Email is always used. If you also want a short message when this request changes status or a quotation is ready, tick the channel. Messages carry only the reference and the status. Standard message rates may apply. You can stop at any time by telling us.</p>
              <div className="space-y-2">
                {channels.sms && <label className="check"><input type="checkbox" checked={messaging.sms} onChange={(e) => setMessaging((m) => ({ ...m, sms: e.target.checked }))} /><span>Send me SMS updates on the phone number above</span></label>}
                {channels.whatsapp && <label className="check"><input type="checkbox" checked={messaging.whatsapp} onChange={(e) => setMessaging((m) => ({ ...m, whatsapp: e.target.checked }))} /><span>Send me WhatsApp updates on the phone number above</span></label>}
              </div>
            </fieldset>
          )}
        </section>
      )}

      {cur === 'review' && service && (
        <section aria-labelledby="h-step">
          <h2 id="h-step" ref={heading} tabIndex={-1} className="mb-2 outline-none">Review and submit</h2>
          <p className="text-steel mb-6">Check everything below. Nothing is sent until you press Submit.</p>
          <div className="space-y-6">
            <ReviewBlock title="Request type" onEdit={() => go('type')}><dd className="font-medium">{service.name}</dd></ReviewBlock>
            {service.acceptsItems && (
              <ReviewBlock title="Items" onEdit={() => go('items')}>
                {lines.length === 0 ? <p className="text-steel">No items listed. You are relying on the attached documents.</p> : (
                  <ul className="divide-y divide-line">{lines.map((l) => <li key={l.id} className="py-2 flex justify-between gap-4 text-sm"><span className="min-w-0">{l.label}{l.note ? <span className="block text-steel">{l.note}</span> : null}</span><span className="mono flex-none">{l.quantity.toLocaleString('en-GB')} {l.unit}</span></li>)}</ul>
                )}
              </ReviewBlock>
            )}
            <ReviewBlock title="Details" onEdit={() => go('details')}>
              <dl className="kv">
                {service.fields.map((f) => { const v = details[f.key]; if (v === undefined || v === '' || (f.type === 'BOOLEAN' && !v)) return null; return <div key={f.key} className="contents"><dt>{f.label}</dt><dd>{f.type === 'BOOLEAN' ? 'Yes' : f.type === 'NUMBER' ? `${v}${f.unit ? ` ${f.unit}` : ''}` : String(v)}</dd></div>; })}
                <dt>Frequency</dt><dd>{recurrence === 'ONE_OFF' ? 'One-off' : 'Recurring'}</dd>
                <dt>Documents</dt><dd>{files.length ? files.map((f) => f.name).join(', ') : 'None attached'}</dd>
              </dl>
            </ReviewBlock>
            <ReviewBlock title="About you" onEdit={() => go('you')}>
              <dl className="kv"><dt>Name</dt><dd>{customer.name}</dd><dt>Email</dt><dd>{customer.email}</dd><dt>Phone</dt><dd>{customer.phone}</dd>{customer.companyName && <><dt>Company</dt><dd>{customer.companyName}</dd></>}{customer.jobTitle && <><dt>Job title</dt><dd>{customer.jobTitle}</dd></>}</dl>
            </ReviewBlock>

            <div className="alert alert-warn"><strong>This is a request, not an order.</strong> Sending it does not confirm an order, a quotation or a commitment by either side. The team will review it and respond; any price comes in a written quotation.</div>

            {/* Honeypot: hidden from people and assistive tech; bots fill it */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
              <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
            </div>

            <div>
              <label className="check"><input type="checkbox" checked={consent} aria-invalid={!!err('consent') || undefined} onChange={(e) => { setConsent(e.target.checked); setErrors((x) => { const n = { ...x }; delete n.consent; return n; }); }} /><span>I have read the <a href="/privacy" target="_blank" rel="noopener">privacy notice</a> and agree that St. Chris may use these details to respond to my request.</span></label>
              {err('consent') && <p className="field-error">{err('consent')}</p>}
            </div>
          </div>
        </section>
      )}

      {busy && (
        <div className="mt-6" role="status" aria-live="polite">
          <p className="text-sm font-medium">{files.length ? `Uploading and sending… ${progress ?? 0}%` : 'Sending your request…'}</p>
          <div className="h-2 bg-paper-2 mt-2 border border-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0}><div className="h-full bg-ember transition-all" style={{ width: `${progress ?? 5}%` }} /></div>
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        {step > 0 ? <button type="button" className="btn btn-outline" onClick={back} disabled={busy}>Back</button> : <span />}
        {cur !== 'review' ? <button type="button" className="btn btn-primary" onClick={next}>Continue <Icon name="arrow" size={18} /></button>
          : <button type="button" className="btn btn-primary !min-h-[3.25rem] !px-8" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Send for quotation'}</button>}
      </div>
    </div>
  );
}

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="panel panel-pad">
      <div className="flex justify-between items-baseline mb-3"><h3 className="!text-base eyebrow !font-medium">{title}</h3><button type="button" className="text-ember underline text-sm" onClick={onEdit}>Edit<span className="sr-only"> {title}</span></button></div>
      {children}
    </div>
  );
}
