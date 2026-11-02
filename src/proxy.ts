import { NextResponse, type NextRequest } from 'next/server';

/**
 * Strict script policy. Every response gets a fresh nonce; only scripts that carry it (Next.js's own bootstrap
 * scripts pick it up automatically) and scripts those load ('strict-dynamic') may run. Inline event handlers,
 * javascript: URLs and injected <script> tags are refused. `unsafe-eval` is added in development only.
 *
 * Styles: a nonce for <style> elements; style="" attributes are allowed separately (style-src-attr) because React
 * and the image component set a few of them. Attribute styles cannot execute script.
 */
export function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV !== 'production';
  const analytics = ['https://plausible.io', 'https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://region1.google-analytics.com', 'https://*.analytics.google.com'];
  const extra = (process.env.ANALYTICS_EXTRA_HOSTS ?? '').split(',').map((h) => h.trim()).filter((h) => /^https:\/\/[a-z0-9.*-]+(:\d+)?$/i.test(h));
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // development: the dev server injects un-nonced style tags, and a nonce would make 'unsafe-inline' be ignored
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: ${analytics.join(' ')} ${extra.join(' ')}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${analytics.join(' ')} ${extra.join(' ')}`.trim(),
    "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|brand/|photos/|fonts/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
