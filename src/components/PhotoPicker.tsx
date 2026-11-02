'use client';

import { useId, useRef, useState } from 'react';
import { Icon } from './Icon';

type Opt = { value: string; label: string };

/** Choose a supplied or library photo, or upload a new one from the camera roll. Writes the chosen reference to a hidden field. */
export function PhotoPicker({ name, label, options, defaultValue = '', hint }: { name: string; label: string; options: Opt[]; defaultValue?: string; hint?: string }) {
  const id = useId();
  const [opts, setOpts] = useState(options);
  const [value, setValue] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const alt = useRef<HTMLInputElement>(null);
  const src = value ? (value.startsWith('media:') ? `/media/${value.slice(6)}` : `/photos/${value}.jpg`) : '';

  async function upload() {
    const f = file.current?.files?.[0];
    const a = alt.current?.value.trim() ?? '';
    setErr('');
    if (!f) return setErr('Choose a photo first.');
    if (a.length < 5) return setErr('Describe the photo in a few words (for people who cannot see it).');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', f); fd.append('alt', a);
      const res = await fetch('/admin/journal/upload', { method: 'POST', body: fd });
      const j = (await res.json()) as { ok: boolean; key?: string; label?: string; error?: string };
      if (!j.ok || !j.key) throw new Error(j.error || 'Upload failed.');
      setOpts((o) => [{ value: j.key!, label: j.label ?? a }, ...o]);
      setValue(j.key);
      if (file.current) file.current.value = '';
      if (alt.current) alt.current.value = '';
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input type="hidden" name={name} value={value} />
      <select id={id} className="select" value={value} onChange={(e) => setValue(e.target.value)}>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p className="hint">{hint}</p>}
      {src && <img src={src} alt="" className="mt-3 max-h-44 border border-line object-contain bg-white" />}
      <details className="mt-3 border border-line p-3 bg-white">
        <summary className="cursor-pointer font-semibold text-ember min-h-[2.75rem] flex items-center gap-2"><Icon name="upload" size={18} />Upload a new photo</summary>
        <div className="mt-3 space-y-3">
          <input ref={file} type="file" accept="image/jpeg,image/png" className="input !py-2" aria-label="Photo file (JPG or PNG)" />
          <input ref={alt} type="text" className="input" placeholder="Describe the photo in a few words" aria-label="Photo description" maxLength={200} />
          <button type="button" className="btn btn-dark btn-sm" onClick={upload} disabled={busy}>{busy ? 'Uploading…' : 'Upload and use'}</button>
          {err && <p className="field-error" role="alert">{err}</p>}
        </div>
      </details>
    </div>
  );
}
