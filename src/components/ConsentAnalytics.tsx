'use client';

import { useCallback, useEffect, useState } from 'react';

type Cfg = { provider: 'plausible' | 'ga4'; id: string };
const COOKIE = 'stchris_consent';
const OPEN_EVENT = 'stchris:cookie-settings';

const readChoice = (): 'granted' | 'denied' | null => {
  try {
    const m = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`));
    const v = m?.split('=')[1];
    return v === 'granted' || v === 'denied' ? v : null;
  } catch { return null; }
};

const writeChoice = (v: 'granted' | 'denied') => {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=${v}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
};

const optedOutByBrowser = () => {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  return nav.doNotTrack === '1' || nav.msDoNotTrack === '1' || nav.globalPrivacyControl === true;
};

function loadScript(cfg: Cfg) {
  if (document.querySelector('script[data-stchris-analytics]')) return;
  const s = document.createElement('script');
  s.async = true;
  s.dataset.stchrisAnalytics = cfg.provider;
  if (cfg.provider === 'plausible') {
    s.defer = true;
    s.src = 'https://plausible.io/js/script.js';
    s.dataset.domain = cfg.id;
  } else {
    const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() { (w.dataLayer as unknown[]).push(arguments); }; // eslint-disable-line prefer-rest-params
    w.gtag('js', new Date());
    w.gtag('config', cfg.id, { anonymize_ip: true });
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cfg.id)}`;
  }
  document.head.appendChild(s);
}

/**
 * Loads analytics only after the visitor accepts. Nothing is requested from the analytics provider before that,
 * and never when the browser sends Do Not Track or Global Privacy Control.
 */
export function ConsentAnalytics({ cfg }: { cfg: Cfg }) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (optedOutByBrowser()) return;
    const c = readChoice();
    if (c === 'granted') loadScript(cfg);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the stored choice lives in the browser, so it can only be read after mount
    else if (c === null) setAsking(true);
    const open = () => setAsking(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, [cfg]);

  const accept = useCallback(() => { writeChoice('granted'); setAsking(false); loadScript(cfg); }, [cfg]);
  const decline = useCallback(() => {
    const was = readChoice();
    writeChoice('denied');
    setAsking(false);
    if (was === 'granted') {
      document.cookie.split('; ').map((c) => c.split('=')[0]!).filter((n) => n.startsWith('_ga')).forEach((n) => { document.cookie = `${n}=; Max-Age=0; Path=/`; });
      location.reload(); // an analytics script that is already running cannot be unloaded
    }
  }, []);

  if (!asking) return null;
  return (
    <div role="region" aria-label="Cookie notice" className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-line shadow-[0_-8px_24px_rgba(28,29,32,.12)] no-print">
      <div className="container-x py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-[0.95rem] max-w-3xl">We would like to use {cfg.provider === 'ga4' ? 'Google Analytics' : 'Plausible Analytics'} to count visits and see which pages are useful. It is off until you accept, and it is never used on the console or the customer portal. <a href="/privacy">Privacy notice</a>.</p>
        <div className="flex gap-3 flex-none">
          <button type="button" className="btn btn-outline" onClick={decline}>Decline</button>
          <button type="button" className="btn btn-primary" onClick={accept}>Accept</button>
        </div>
      </div>
    </div>
  );
}

export function CookieSettingsButton() {
  return <button type="button" className="foot-link !text-paper/80 hover:underline" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>Cookie settings</button>;
}
