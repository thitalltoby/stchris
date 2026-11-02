/**
 * Default wording and photographs replaced in the November 2026 redesign (GeePee positioning, the retail brand removed,
 * new photographs). The seed is create-only, so a database seeded before then keeps the old defaults. The seed applies
 * this list once: a field moves to its current default only while it still holds the old one, so console edits are kept.
 * `from` is revisionHash() of the old value, so retired wording is not repeated here.
 */
import { createHash } from 'node:crypto';

export const REVISION_KEY = 'seed:revision:2026-11-redesign';

export const revisionHash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

export interface Revision { model: 'category' | 'brand' | 'service' | 'division'; slug: string; field: string; from: string }

export const REVISIONS: Revision[] = [
  { model: 'category', slug: 'building-materials', field: 'imageKey', from: '42417ad36370e32b' },
  { model: 'category', slug: 'water-storage-tanks', field: 'summary', from: '694a14acc35deec8' },
  { model: 'category', slug: 'water-storage-tanks', field: 'description', from: 'bd5c0cf77de3f179' },
  { model: 'category', slug: 'sanitary-ware', field: 'imageKey', from: 'ca8a18a28f53a859' },
  { model: 'category', slug: 'baths-and-showers', field: 'imageKey', from: '3782ae1fd9cceca8' },
  { model: 'category', slug: 'interior-finishing', field: 'imageKey', from: '7ed82a25cc2df20b' },
  { model: 'brand', slug: 'geepee', field: 'name', from: 'ef0f7d6e96ee75b8' },
  { model: 'brand', slug: 'geepee', field: 'note', from: '0287bb287d0a100a' },
  { model: 'brand', slug: 'geepee', field: 'visible', from: 'fcbcf165908dd18a' },
  { model: 'service', slug: 'project-bulk-supply', field: 'imageKey', from: '7ed82a25cc2df20b' },
  { model: 'service', slug: 'source-a-product', field: 'imageKey', from: '7017ac82c10710e5' },
  { model: 'service', slug: 'trade-account', field: 'imageKey', from: 'd9e9ef38563916e1' },
  { model: 'service', slug: 'dealer-partnership', field: 'imageKey', from: 'b49eb5f955551b98' },
  { model: 'service', slug: 'supplier-introduction', field: 'imageKey', from: '42417ad36370e32b' },
  { model: 'service', slug: 'corporate-procurement', field: 'imageKey', from: '7017ac82c10710e5' },
  { model: 'division', slug: 'building-materials', field: 'imageKey', from: '42417ad36370e32b' },
  { model: 'division', slug: 'bathroom-and-kitchen', field: 'description', from: 'e88dd94ae23bdcae' },
  { model: 'division', slug: 'bathroom-and-kitchen', field: 'highlights', from: '8ad80b9a26fc8ec9' },
  { model: 'division', slug: 'bathroom-and-kitchen', field: 'imageKey', from: 'ca8a18a28f53a859' },
  { model: 'division', slug: 'procurement-and-sourcing', field: 'imageKey', from: '7017ac82c10710e5' },
  { model: 'division', slug: 'importation-and-distribution', field: 'summary', from: 'cbf80925246f1bec' },
  { model: 'division', slug: 'importation-and-distribution', field: 'description', from: '826e8f3015e71940' },
  { model: 'division', slug: 'importation-and-distribution', field: 'highlights', from: '9c0d2fa3843e8e4c' },
  { model: 'division', slug: 'importation-and-distribution', field: 'imageKey', from: '364aab5de6de889f' },
];

/** The FAQ replaced in the same change: the old question's hash, and the question that replaces it */
export const FAQ_REVISION = { from: '1f03c2c85a627e66', to: "Is St. Chris Global connected to GeePee Water Tanks?" };
