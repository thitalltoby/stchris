'use client';

import { useEffect } from 'react';

/**
 * Eases `[data-reveal]` elements in as they scroll into view. Elements already on screen are left alone (no flash),
 * and nothing is hidden at all unless the visitor allows motion. Without JavaScript everything is simply visible.
 */
export function Reveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const hide = () => {
      document.querySelectorAll<HTMLElement>('[data-reveal]:not(.reveal-pending)').forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
        el.classList.add('reveal-pending');
        const d = el.getAttribute('data-reveal');
        if (d && /^\d+$/.test(d)) el.style.setProperty('--reveal-delay', `${d}ms`);
        io.observe(el);
      });
    };
    hide();
    // pages that stream or change in place
    const mo = new MutationObserver(hide);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, []);
  return null;
}
