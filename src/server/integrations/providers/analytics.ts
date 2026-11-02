import 'server-only';
import { db } from '../../db';
import type { Adapter } from '../core';

export interface AnalyticsConfig { provider: 'plausible' | 'ga4'; id: string }

const PLAUSIBLE = /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i;
const GA4 = /^G-[A-Z0-9]{6,14}$/;

/** Read by the public layout. Null unless analytics is switched on and valid. */
export async function getAnalytics(): Promise<AnalyticsConfig | null> {
  try {
    const row = await db.integration.findUnique({ where: { key: 'analytics' } });
    if (!row?.enabled) return null;
    const c = row.config as Record<string, string>;
    if (c.provider === 'plausible' && PLAUSIBLE.test(c.id ?? '')) return { provider: 'plausible', id: c.id! };
    if (c.provider === 'ga4' && GA4.test(c.id ?? '')) return { provider: 'ga4', id: c.id! };
  } catch { /* the site must render without analytics */ }
  return null;
}

export const analyticsAdapter: Adapter = {
  key: 'analytics',
  name: 'Analytics',
  category: 'Analytics',
  kind: 'site',
  purpose: 'Adds page-view analytics to the public website only (never the console or the customer portal). A cookie notice asks visitors first: the analytics script is not loaded until they accept, and not at all if their browser sends Do Not Track.',
  state: 'implemented',
  requirements: ['A Plausible site (domain) or a Google Analytics 4 measurement ID', 'St. Chris’s decision on its privacy notice wording for analytics (the notice page should name the tool used)'],
  verification: 'The consent banner, the script loading rules and the content-security-policy allowances are tested in a browser. Not verified against a live Plausible or Google account: check that page views appear in your dashboard after accepting the banner.',
  fields: [
    { key: 'provider', label: 'Tool', type: 'select', required: true, options: [{ value: 'plausible', label: 'Plausible (hosted at plausible.io)' }, { value: 'ga4', label: 'Google Analytics 4' }] },
    { key: 'id', label: 'Domain (Plausible) or measurement ID (GA4)', required: true, placeholder: 'stchris.example or G-XXXXXXXXXX' },
  ],
  events: [],
  validate(config) {
    if (config.provider === 'plausible' && !PLAUSIBLE.test(config.id ?? '')) throw new Error('For Plausible, enter the site domain, for example stchris.example.');
    if (config.provider === 'ga4' && !GA4.test(config.id ?? '')) throw new Error('For Google Analytics 4, enter a measurement ID such as G-ABC123XYZ4.');
  },
  async test(config) {
    try { this.validate?.(config, {}); } catch (e) { return { ok: false, message: (e as Error).message }; }
    return { ok: true, message: 'The identifier is in the right format. Open the public site, accept the cookie notice and look for the visit in your analytics dashboard: this check cannot see that from here.' };
  },
};
