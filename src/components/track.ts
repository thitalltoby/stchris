'use client';

type W = Window & { gtag?: (...a: unknown[]) => void; plausible?: (name: string, o?: { props?: Record<string, string> }) => void };

/** Sends a conversion event, but only if the visitor accepted analytics (the script is loaded only then). Never carries personal details. */
export function track(name: 'generate_lead' | 'whatsapp_click' | 'opportunity_interest', params: Record<string, string> = {}): void {
  try {
    const w = window as W;
    if (typeof w.gtag === 'function') w.gtag('event', name, params);
    if (typeof w.plausible === 'function') w.plausible(name, { props: params });
  } catch { /* analytics must never break the page */ }
}
