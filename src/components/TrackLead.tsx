'use client';

import { useEffect } from 'react';
import { track } from './track';

/** Fires one "generate_lead" conversion when an enquiry has just been submitted. The reference itself is not sent. */
export function TrackLead({ type, id }: { type: string; id: string }) {
  useEffect(() => {
    const key = `lead-sent:${id}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* storage unavailable: send anyway, once per load */ }
    // the analytics script loads only after consent, and may still be starting: try for a few seconds
    let tries = 0;
    const t = setInterval(() => {
      const w = window as unknown as { gtag?: unknown; plausible?: unknown };
      if (w.gtag || w.plausible) { clearInterval(t); track('generate_lead', { lead_type: type }); try { sessionStorage.setItem(key, '1'); } catch { /* ignore */ } }
      else if (++tries > 12) clearInterval(t);
    }, 400);
    return () => clearInterval(t);
  }, [type, id]);
  return null;
}
