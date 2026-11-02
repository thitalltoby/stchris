import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from './db';
import { audit } from './audit';
import { conflict, invalid, notFound } from './errors';
import { assertCan, type Principal } from './rbac';
import { checkImageRef } from './media';
import { slugify } from '@/lib/format';

// ─── Public reads ──────────────────────────────────────────────────

export const GROUP_ORDER = ['Building & plumbing', 'Bathroom & kitchen', 'Tiles & finishing'] as const;

export async function getCategories() {
  const cats = await db.category.findMany({
    where: { visible: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: { where: { status: 'PUBLISHED' } } } } },
  });
  return cats.map((c) => ({ ...c, range: asStrings(c.range), productCount: c._count.products }));
}

export async function getCategoriesByGroup() {
  const cats = await getCategories();
  const groups = new Map<string, typeof cats>();
  for (const c of cats) groups.set(c.groupLabel, [...(groups.get(c.groupLabel) ?? []), c]);
  const known = GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({ label: g as string, categories: groups.get(g)! }));
  const extra = [...groups.keys()].filter((g) => !(GROUP_ORDER as readonly string[]).includes(g)).map((g) => ({ label: g, categories: groups.get(g)! }));
  return [...known, ...extra];
}

export async function getCategoryPage(slug: string) {
  const c = await db.category.findFirst({
    where: { slug, visible: true },
    include: { products: { where: { status: 'PUBLISHED' }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { brand: true, variants: { where: { visible: true }, orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!c) return null;
  return { ...c, range: asStrings(c.range), products: c.products.map(shapeProduct) };
}

export async function getProductPage(slug: string) {
  const p = await db.product.findFirst({
    where: { slug, status: 'PUBLISHED' },
    include: { category: true, brand: true, variants: { where: { visible: true }, orderBy: { sortOrder: 'asc' } } },
  });
  if (!p) return null;
  const related = await db.product.findMany({
    where: { categoryId: p.categoryId, status: 'PUBLISHED', NOT: { id: p.id } },
    orderBy: { sortOrder: 'asc' },
    take: 4,
    include: { brand: true, variants: { where: { visible: true }, orderBy: { sortOrder: 'asc' } } },
  });
  return { ...shapeProduct(p), category: p.category, related: related.map(shapeProduct) };
}

export async function getFeaturedProducts(take = 6) {
  const rows = await db.product.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
    take,
    include: { brand: true, category: true, variants: { where: { visible: true }, orderBy: { sortOrder: 'asc' } } },
  });
  return rows.map((p) => ({ ...shapeProduct(p), category: p.category }));
}

export async function getVisibleBrands() {
  return db.brand.findMany({ where: { visible: true, products: { some: { status: 'PUBLISHED' } } }, orderBy: { name: 'asc' } });
}

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const asSpecs = (v: unknown): { label: string; value: string }[] =>
  Array.isArray(v) ? v.filter((x): x is { label: string; value: string } => !!x && typeof x === 'object' && typeof (x as any).label === 'string' && typeof (x as any).value === 'string') : [];

type PublicVariant<V> = Omit<V, 'price'>;
type Shaped<T extends { variants: unknown[] }> = Omit<T, 'highlights' | 'specs' | 'imageKeys' | 'variants'> & {
  highlights: string[]; specs: { label: string; value: string }[]; imageKeys: string[];
  variants: PublicVariant<T['variants'][number]>[];
};
/** Public shape of a product. The price book is internal: prices are removed here so no public page or API can show them. */
function shapeProduct<T extends { highlights: unknown; specs: unknown; imageKeys: unknown; variants: { price: Prisma.Decimal | null }[] }>(p: T): Shaped<T> {
  const variants = p.variants.map((v) => { const pub = { ...v } as Partial<typeof v>; delete pub.price; return pub; }) as PublicVariant<T['variants'][number]>[];
  return { ...p, highlights: asStrings(p.highlights), specs: asSpecs(p.specs), imageKeys: asStrings(p.imageKeys), variants };
}

export interface SearchHit { kind: 'category' | 'product' | 'range'; label: string; href: string; hint: string; categorySlug?: string }

/** Search across category names, product names, brands and the "what we supply" lines. */
export async function searchCatalogue(q: string): Promise<SearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const [cats, prods] = await Promise.all([
    db.category.findMany({ where: { visible: true } }),
    db.product.findMany({
      where: { status: 'PUBLISHED', OR: [{ name: { contains: term, mode: 'insensitive' } }, { summary: { contains: term, mode: 'insensitive' } }, { brand: { name: { contains: term, mode: 'insensitive' } } }, { variants: { some: { sku: { contains: term, mode: 'insensitive' } } } }] },
      include: { category: true, brand: true },
      take: 12,
    }),
  ]);
  const t = term.toLowerCase();
  const hits: SearchHit[] = [];
  for (const c of cats) {
    if (c.name.toLowerCase().includes(t) || c.summary.toLowerCase().includes(t)) hits.push({ kind: 'category', label: c.name, href: `/catalogue/${c.slug}`, hint: c.groupLabel, categorySlug: c.slug });
    for (const r of asStrings(c.range)) if (r.toLowerCase().includes(t)) hits.push({ kind: 'range', label: r, href: `/catalogue/${c.slug}`, hint: c.name, categorySlug: c.slug });
  }
  for (const p of prods) hits.push({ kind: 'product', label: p.name, href: `/products/${p.slug}`, hint: [p.brand?.name, p.category.name].filter(Boolean).join(' · ') });
  return hits.slice(0, 24);
}

// ─── Admin reads ───────────────────────────────────────────────────

export const adminCategories = () => db.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { products: true } } } });
export const adminProducts = (opts: { categoryId?: string; q?: string } = {}) =>
  db.product.findMany({
    where: { ...(opts.categoryId ? { categoryId: opts.categoryId } : {}), ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: 'insensitive' } }, { variants: { some: { sku: { contains: opts.q, mode: 'insensitive' } } } }] } : {}) },
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: { category: true, brand: true, variants: { orderBy: { sortOrder: 'asc' } } },
  });
export const adminProduct = (id: string) => db.product.findUnique({ where: { id }, include: { category: true, brand: true, variants: { orderBy: { sortOrder: 'asc' } } } });
export const adminBrands = () => db.brand.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: true } } } });

// ─── Admin writes ──────────────────────────────────────────────────

const lines = (s: string | undefined, max: number) => (s ?? '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, max);
const fail = (e: z.ZodError) => invalid('Please check the highlighted fields.', Object.fromEntries(e.issues.map((i) => [i.path.join('.'), i.message])));
const who = (u: Principal) => ({ id: u.id, label: u.name });

const categorySchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(100),
  slug: z.string().trim().max(80).optional().default(''),
  summary: z.string().trim().min(5, 'Write a one-line summary.').max(240),
  description: z.string().trim().max(8000).optional().default(''),
  range: z.string().optional().default(''),
  groupLabel: z.string().trim().min(2).max(60).default('Building & plumbing'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  visible: z.coerce.boolean().default(true),
  imageKey: z.string().optional(),
});

export async function saveCategory(user: Principal, id: string | null, raw: unknown) {
  assertCan(user, 'catalogue.manage');
  const p = categorySchema.safeParse(raw);
  if (!p.success) throw fail(p.error);
  const d = p.data;
  const slug = slugify(d.slug || d.name);
  if (await db.category.findFirst({ where: { slug, ...(id ? { NOT: { id } } : {}) } })) throw conflict('Another category already uses that web address.');
  const data = { name: d.name, slug, summary: d.summary, description: d.description, range: lines(d.range, 40), groupLabel: d.groupLabel, sortOrder: d.sortOrder, visible: d.visible, needsReview: false, ...(d.imageKey !== undefined ? { imageKey: await checkImageRef(d.imageKey) } : {}) };
  const c = id ? await db.category.update({ where: { id }, data }) : await db.category.create({ data });
  await audit(who(user), id ? 'category.updated' : 'category.created', 'Category', c.id, { name: c.name });
  return c;
}

export async function deleteCategory(user: Principal, id: string) {
  assertCan(user, 'catalogue.manage');
  const c = await db.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!c) throw notFound('Category not found.');
  if (c._count.products) throw invalid(`“${c.name}” still has ${c._count.products} product(s). Move or delete them first, or hide the category instead.`);
  await db.category.delete({ where: { id } });
  await audit(who(user), 'category.deleted', 'Category', id, { name: c.name });
}

const brandSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(80),
  website: z.string().trim().max(200).optional().default('').refine((v) => !v || /^https:\/\/[^\s]+$/i.test(v), 'Use a full https:// address.'),
  note: z.string().trim().max(500).optional().default(''),
  visible: z.coerce.boolean().default(true),
});

export async function saveBrand(user: Principal, id: string | null, raw: unknown) {
  assertCan(user, 'catalogue.manage');
  const p = brandSchema.safeParse(raw);
  if (!p.success) throw fail(p.error);
  const d = p.data;
  const slug = slugify(d.name);
  if (await db.brand.findFirst({ where: { slug, ...(id ? { NOT: { id } } : {}) } })) throw conflict('That brand already exists.');
  const data = { name: d.name, slug, website: d.website || null, note: d.note, visible: d.visible };
  const b = id ? await db.brand.update({ where: { id }, data }) : await db.brand.create({ data });
  await audit(who(user), id ? 'brand.updated' : 'brand.created', 'Brand', b.id, { name: b.name });
  return b;
}

export async function deleteBrand(user: Principal, id: string) {
  assertCan(user, 'catalogue.manage');
  await db.brand.delete({ where: { id } }); // products keep working: their brand is cleared
  await audit(who(user), 'brand.deleted', 'Brand', id);
}

const productSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(140),
  slug: z.string().trim().max(100).optional().default(''),
  categoryId: z.string().min(1, 'Choose a category.'),
  brandId: z.string().optional().default(''),
  summary: z.string().trim().min(5, 'Write a short summary.').max(300),
  description: z.string().trim().max(12000).optional().default(''),
  highlights: z.string().optional().default(''),
  /** One "Label: value" per line */
  specs: z.string().optional().default(''),
  imageKeys: z.string().optional().default(''),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  featured: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export async function saveProduct(user: Principal, id: string | null, raw: unknown) {
  assertCan(user, 'catalogue.manage');
  const p = productSchema.safeParse(raw);
  if (!p.success) throw fail(p.error);
  const d = p.data;
  const slug = slugify(d.slug || d.name);
  if (await db.product.findFirst({ where: { slug, ...(id ? { NOT: { id } } : {}) } })) throw conflict('Another product already uses that web address.');
  if (!(await db.category.findUnique({ where: { id: d.categoryId } }))) throw invalid('Choose a category.', { categoryId: 'Not found.' });
  if (d.brandId && !(await db.brand.findUnique({ where: { id: d.brandId } }))) throw invalid('Choose a brand from the list.', { brandId: 'Not found.' });
  const specs = lines(d.specs, 40).map((l) => {
    const i = l.indexOf(':');
    return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : null;
  });
  if (specs.some((s) => !s || !s.value)) throw invalid('Write each specification as “Label: value”, one per line.', { specs: 'Use “Label: value”.' });
  const imageKeys: string[] = [];
  for (const k of lines(d.imageKeys, 8)) {
    const ok = await checkImageRef(k);
    if (ok) imageKeys.push(ok);
  }
  const data = {
    name: d.name, slug, categoryId: d.categoryId, brandId: d.brandId || null, summary: d.summary, description: d.description,
    highlights: lines(d.highlights, 10), specs: specs as { label: string; value: string }[], imageKeys, status: d.status, featured: d.featured, sortOrder: d.sortOrder, needsReview: false,
  };
  const prod = id ? await db.product.update({ where: { id }, data }) : await db.product.create({ data });
  await audit(who(user), id ? 'product.updated' : 'product.created', 'Product', prod.id, { name: prod.name, status: prod.status });
  return prod;
}

export async function deleteProduct(user: Principal, id: string) {
  assertCan(user, 'catalogue.manage');
  const p = await db.product.findUnique({ where: { id } });
  if (!p) throw notFound('Product not found.');
  // Requests and quotations keep their own copy of what was asked, so deleting a product never rewrites history
  await db.product.delete({ where: { id } });
  await db.projectListItem.updateMany({ where: { productId: id }, data: { productId: null, variantId: null } });
  await audit(who(user), 'product.deleted', 'Product', id, { name: p.name });
}

const variantSchema = z.object({
  label: z.string().trim().min(1, 'Enter the size or option.').max(100),
  sku: z.string().trim().max(60).optional().default(''),
  unit: z.string().trim().min(1).max(30).default('each'),
  price: z.string().trim().optional().default('').refine((v) => v === '' || /^\d{1,14}(\.\d{1,2})?$/.test(v.replace(/,/g, '')), 'Enter an amount such as 12500 or 12500.50.'),
  availability: z.enum(['ON_REQUEST', 'IN_STOCK', 'ON_ORDER', 'DISCONTINUED']).default('ON_REQUEST'),
  minQuantity: z.string().trim().optional().default('').refine((v) => v === '' || (Number(v) > 0 && Number.isFinite(Number(v))), 'Enter a number above zero.'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  visible: z.coerce.boolean().default(true),
});

export async function saveVariant(user: Principal, productId: string, variantId: string | null, raw: unknown) {
  assertCan(user, 'catalogue.manage');
  const p = variantSchema.safeParse(raw);
  if (!p.success) throw fail(p.error);
  const d = p.data;
  if (d.sku && (await db.productVariant.findFirst({ where: { sku: d.sku, ...(variantId ? { NOT: { id: variantId } } : {}) } }))) throw conflict('Another size already uses that SKU.');
  const data = { label: d.label, sku: d.sku || null, unit: d.unit, price: d.price ? d.price.replace(/,/g, '') : null, availability: d.availability, minQuantity: d.minQuantity || null, sortOrder: d.sortOrder, visible: d.visible };
  const v = variantId ? await db.productVariant.update({ where: { id: variantId }, data }) : await db.productVariant.create({ data: { ...data, productId } });
  await audit(who(user), variantId ? 'variant.updated' : 'variant.created', 'Product', productId, { label: v.label, sku: v.sku });
  return v;
}

export async function deleteVariant(user: Principal, id: string) {
  assertCan(user, 'catalogue.manage');
  const v = await db.productVariant.findUnique({ where: { id } });
  if (!v) throw notFound('Size not found.');
  await db.productVariant.delete({ where: { id } });
  await db.projectListItem.updateMany({ where: { variantId: id }, data: { variantId: null } });
  await audit(who(user), 'variant.deleted', 'Product', v.productId, { label: v.label });
}

// ─── CSV import / export ───────────────────────────────────────────

export const CSV_COLUMNS = ['category', 'product', 'summary', 'brand', 'size', 'sku', 'unit', 'price', 'availability', 'status'] as const;

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // spreadsheet formula injection
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function exportCatalogueCsv(user: Principal): Promise<string> {
  assertCan(user, 'catalogue.manage');
  const rows = await adminProducts();
  const out = [CSV_COLUMNS.join(',')];
  for (const p of rows) {
    const vs = p.variants.length ? p.variants : [null];
    for (const v of vs) out.push([p.category.name, p.name, p.summary, p.brand?.name ?? '', v?.label ?? '', v?.sku ?? '', v?.unit ?? '', v?.price?.toString() ?? '', v?.availability ?? '', p.status].map(csvCell).join(','));
  }
  return out.join('\r\n') + '\r\n';
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((c) => c.trim() !== '')) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export interface ImportResult { created: number; updated: number; errors: string[] }

/** Create or update products and sizes from a CSV. Matches products by name within a category and sizes by SKU (or label). Nothing is deleted. */
export async function importCatalogueCsv(user: Principal, text: string): Promise<ImportResult> {
  assertCan(user, 'catalogue.manage');
  const rows = parseCsv(text);
  if (rows.length < 2) throw invalid('The file has no rows to import.');
  const head = rows[0]!.map((h) => h.trim().toLowerCase());
  const missing = ['category', 'product'].filter((c) => !head.includes(c));
  if (missing.length) throw invalid(`The first row must contain the column(s): ${missing.join(', ')}.`);
  if (rows.length > 2001) throw invalid('Import at most 2,000 rows at a time.');
  const col = (r: string[], name: string) => (r[head.indexOf(name)] ?? '').trim();
  const res: ImportResult = { created: 0, updated: 0, errors: [] };
  const cats = new Map((await db.category.findMany()).map((c) => [c.name.toLowerCase(), c]));
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const line = i + 1;
    try {
      const cat = cats.get(col(r, 'category').toLowerCase());
      if (!cat) throw new Error(`category “${col(r, 'category')}” does not exist (create it first)`);
      const name = col(r, 'product');
      if (name.length < 2) throw new Error('product name is missing');
      const brandName = col(r, 'brand');
      const brand = brandName ? await db.brand.upsert({ where: { slug: slugify(brandName) }, create: { name: brandName, slug: slugify(brandName), visible: false, note: 'Created by CSV import. Confirm the distribution arrangement before showing it.' }, update: {} }) : null;
      const status = col(r, 'status').toUpperCase() === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
      let product = await db.product.findFirst({ where: { categoryId: cat.id, name: { equals: name, mode: 'insensitive' } } });
      if (product) {
        product = await db.product.update({ where: { id: product.id }, data: { ...(col(r, 'summary') ? { summary: col(r, 'summary') } : {}), ...(brand ? { brandId: brand.id } : {}), status } });
        res.updated++;
      } else {
        let slug = slugify(name), n = 2;
        while (await db.product.findUnique({ where: { slug } })) slug = `${slugify(name)}-${n++}`;
        product = await db.product.create({ data: { name, slug, categoryId: cat.id, brandId: brand?.id ?? null, summary: col(r, 'summary') || name, status, needsReview: true } });
        res.created++;
      }
      const label = col(r, 'size');
      if (label) {
        const sku = col(r, 'sku') || null;
        const price = col(r, 'price').replace(/,/g, '');
        if (price && !/^\d{1,14}(\.\d{1,2})?$/.test(price)) throw new Error(`price “${price}” is not a number`);
        const avail = col(r, 'availability').toUpperCase().replace(/\s+/g, '_');
        const availability = (['ON_REQUEST', 'IN_STOCK', 'ON_ORDER', 'DISCONTINUED'] as const).find((a) => a === avail) ?? 'ON_REQUEST';
        const existing = await db.productVariant.findFirst({ where: { productId: product.id, OR: [...(sku ? [{ sku }] : []), { label: { equals: label, mode: 'insensitive' as const } }] } });
        const data = { label, sku, unit: col(r, 'unit') || 'each', price: price || null, availability };
        if (existing) await db.productVariant.update({ where: { id: existing.id }, data });
        else await db.productVariant.create({ data: { ...data, productId: product.id } });
      }
    } catch (e) {
      res.errors.push(`Row ${line}: ${e instanceof Error ? e.message : 'could not be imported'}`);
      if (res.errors.length >= 25) { res.errors.push('Stopped listing errors after 25.'); break; }
    }
  }
  await audit(who(user), 'catalogue.imported', 'Product', 'csv', { created: res.created, updated: res.updated, errors: res.errors.length });
  return res;
}
