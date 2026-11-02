import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { db } from '@/server/db';
import { AppError } from '@/server/errors';
import { resetDb, makeUser, principal } from './helpers';
import {
  saveCategory, deleteCategory, saveBrand, deleteBrand, saveProduct, deleteProduct, saveVariant, deleteVariant,
  getCategoryPage, getProductPage, getFeaturedProducts, getVisibleBrands, searchCatalogue, exportCatalogueCsv, importCatalogueCsv, parseCsv,
} from '@/server/catalogue';

const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof AppError ? e.code : `ERR:${e}`));

let staff: ReturnType<typeof principal>;
let viewer: ReturnType<typeof principal>;

beforeAll(async () => { await resetDb(); });
beforeEach(async () => {
  await resetDb();
  staff = principal(await makeUser('COMMERCIAL'));
  viewer = principal(await makeUser('APPROVER')); // can see customers and reports, but not edit the catalogue
});

const cat = (over: Record<string, unknown> = {}) => saveCategory(staff, null, { name: 'Water tanks', summary: 'Storage tanks for homes and sites.', ...over });
const prod = (categoryId: string, over: Record<string, unknown> = {}) => saveProduct(staff, null, { name: 'Black tank', categoryId, summary: 'A black polyethylene tank.', status: 'PUBLISHED', ...over });

describe('catalogue management', () => {
  it('lets commercial staff build categories, products and sizes, and keeps everyone else out', async () => {
    const c = await cat();
    expect(c.slug).toBe('water-tanks');
    const p = await prod(c.id);
    const v = await saveVariant(staff, p.id, null, { label: '1,000 L', sku: 'TNK-1000', unit: 'each', price: '125,000.50', availability: 'IN_STOCK' });
    expect(v.price?.toString()).toBe('125000.5');
    expect(await code(saveCategory(viewer, null, { name: 'Pipes', summary: 'Pipes and fittings.' }))).toBe('FORBIDDEN');
    expect(await code(saveProduct(viewer, null, { name: 'x1', categoryId: c.id, summary: 'Something here' }))).toBe('FORBIDDEN');
    expect(await code(saveVariant(viewer, p.id, null, { label: '500 L' }))).toBe('FORBIDDEN');
    expect(await code(exportCatalogueCsv(viewer))).toBe('FORBIDDEN');
    expect(await code(importCatalogueCsv(viewer, 'category,product\nWater tanks,x1'))).toBe('FORBIDDEN');
    expect(await db.auditEvent.count({ where: { action: { startsWith: 'product.' } } })).toBe(1);
  });

  it('rejects duplicate addresses, duplicate SKUs, bad prices and malformed specifications', async () => {
    const c = await cat();
    const p = await prod(c.id);
    expect(await code(prod(c.id))).toBe('CONFLICT');
    await saveVariant(staff, p.id, null, { label: 'A', sku: 'SKU-1' });
    expect(await code(saveVariant(staff, p.id, null, { label: 'B', sku: 'SKU-1' }))).toBe('CONFLICT');
    expect(await code(saveVariant(staff, p.id, null, { label: 'B', price: '12x' }))).toBe('VALIDATION');
    expect(await code(prod(c.id, { name: 'Other tank', specs: 'No colon here' }))).toBe('VALIDATION');
    expect(await code(prod('nope', { name: 'Third tank' }))).toBe('VALIDATION');
  });

  it('stores specifications, highlights and only valid photo keys', async () => {
    const c = await cat();
    const p = await prod(c.id, { specs: 'Material: Polyethylene\nColour: Black', highlights: 'UV stabilised\n\nFood grade', imageKeys: 'tank-black-1' });
    expect(await code(prod(c.id, { name: 'Other tank', imageKeys: 'not-a-photo' }))).toBe('VALIDATION');
    expect(p.specs).toEqual([{ label: 'Material', value: 'Polyethylene' }, { label: 'Colour', value: 'Black' }]);
    expect(p.highlights).toEqual(['UV stabilised', 'Food grade']);
    expect(p.imageKeys).toEqual(['tank-black-1']);
  });

  it('shows only published products, visible categories and visible sizes publicly', async () => {
    const c = await cat();
    const live = await prod(c.id);
    const draft = await prod(c.id, { name: 'Draft tank', status: 'DRAFT' });
    await saveVariant(staff, live.id, null, { label: 'Shown' });
    await saveVariant(staff, live.id, null, { label: 'Hidden', visible: false });
    const page = await getCategoryPage('water-tanks');
    expect(page?.products.map((x) => x.slug)).toEqual(['black-tank']);
    const detail = await getProductPage('black-tank');
    expect(detail?.variants.map((v) => v.label)).toEqual(['Shown']);
    expect(await getProductPage(draft.slug)).toBeNull();
    await saveCategory(staff, c.id, { name: 'Water tanks', summary: 'Storage tanks for homes and sites.', visible: false });
    expect(await getCategoryPage('water-tanks')).toBeNull();
  });

  it('never exposes the internal price book on public reads', async () => {
    const c = await cat();
    const p = await prod(c.id, { featured: true });
    await saveVariant(staff, p.id, null, { label: '1,000 L', price: '99999' });
    const json = JSON.stringify([await getProductPage(p.slug), await getCategoryPage(c.slug), await getFeaturedProducts(), await searchCatalogue('tank')]);
    expect(json).not.toContain('99999');
    expect(json.toLowerCase()).not.toContain('"price"');
  });

  it('searches names, summaries, brands and SKUs, and ignores drafts', async () => {
    const c = await cat();
    const b = await saveBrand(staff, null, { name: 'GEEPEE', visible: true });
    const p = await prod(c.id, { brandId: b.id });
    await saveVariant(staff, p.id, null, { label: '1,000 L', sku: 'TNK-1000' });
    await prod(c.id, { name: 'Secret draft', status: 'DRAFT' });
    expect((await searchCatalogue('geepee')).map((h) => h.label)).toContain('Black tank');
    expect((await searchCatalogue('tnk-1000')).map((h) => h.label)).toContain('Black tank');
    expect((await searchCatalogue('secret')).length).toBe(0);
    expect(await searchCatalogue('a')).toEqual([]);
  });

  it('shows a brand only once staff have made it visible', async () => {
    await saveBrand(staff, null, { name: 'GEEPEE', visible: false });
    expect(await getVisibleBrands()).toHaveLength(0);
    const b = await db.brand.findFirstOrThrow();
    const c = await cat();
    await prod(c.id, { brandId: b.id });
    expect(await getVisibleBrands()).toHaveLength(0);
    await saveBrand(staff, b.id, { name: 'GEEPEE', visible: true });
    expect(await getVisibleBrands()).toHaveLength(1);
  });

  it('refuses to delete a category that still has products, and clears a deleted brand from its products', async () => {
    const c = await cat();
    const b = await saveBrand(staff, null, { name: 'GEEPEE', visible: true });
    const p = await prod(c.id, { brandId: b.id });
    expect(await code(deleteCategory(staff, c.id))).toBe('VALIDATION');
    await deleteBrand(staff, b.id);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).brandId).toBeNull();
    await deleteProduct(staff, p.id);
    await deleteCategory(staff, c.id);
    expect(await db.category.count()).toBe(0);
  });

  it('keeps list lines as plain text when their product or size is deleted', async () => {
    const c = await cat();
    const p = await prod(c.id);
    const v = await saveVariant(staff, p.id, null, { label: '1,000 L' });
    const list = await db.projectList.create({ data: { tokenHash: 'h' } });
    const it1 = await db.projectListItem.create({ data: { listId: list.id, productId: p.id, variantId: v.id, label: 'Black tank: 1,000 L', unit: 'each', quantity: 2 } });
    await deleteVariant(staff, v.id);
    expect((await db.projectListItem.findUniqueOrThrow({ where: { id: it1.id } })).variantId).toBeNull();
    await deleteProduct(staff, p.id);
    const after = await db.projectListItem.findUniqueOrThrow({ where: { id: it1.id } });
    expect(after.productId).toBeNull();
    expect(after.label).toBe('Black tank: 1,000 L');
  });
});

describe('catalogue CSV', () => {
  it('parses quoted cells, embedded commas and newlines, doubled quotes and a byte-order mark', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"line1\nline2",z\r\n\r\n');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['line1\nline2', 'z']]);
  });

  it('imports new products and sizes as drafts needing review, and updates on a second run', async () => {
    await cat();
    const csv = [
      'category,product,summary,brand,size,sku,unit,price,availability,status',
      'Water tanks,Blue tank,A blue tank,GEEPEE,500 L,BLU-500,each,"45,000",in stock,published',
      'Water tanks,Blue tank,,,1000 L,BLU-1000,each,80000,,',
      'Nowhere,Ghost,,,,,,,,',
      'Water tanks,Bad price,,,1 L,B-1,each,abc,,',
    ].join('\n');
    const r = await importCatalogueCsv(staff, csv);
    expect(r.created).toBeGreaterThanOrEqual(1);
    expect(r.errors.some((e) => e.startsWith('Row 4') && /does not exist/.test(e))).toBe(true);
    expect(r.errors.some((e) => e.startsWith('Row 5') && /price/.test(e))).toBe(true);
    const p = await db.product.findFirstOrThrow({ where: { name: 'Blue tank' }, include: { variants: true, brand: true } });
    expect(p.variants).toHaveLength(2);
    expect(p.variants.find((v) => v.sku === 'BLU-500')?.price?.toString()).toBe('45000');
    expect(p.variants.find((v) => v.sku === 'BLU-500')?.availability).toBe('IN_STOCK');
    expect(p.needsReview).toBe(true);
    expect(p.brand?.visible).toBe(false); // a brand created by import is not shown until staff confirm the arrangement
    const again = await importCatalogueCsv(staff, csv);
    expect(again.created).toBe(0);
    expect(await db.productVariant.count()).toBe(2);
    expect(await db.product.count({ where: { name: 'Blue tank' } })).toBe(1);
  });

  it('rejects a file without the required columns and exports a file that imports back unchanged', async () => {
    expect(await code(importCatalogueCsv(staff, 'name,thing\na,b'))).toBe('VALIDATION');
    expect(await code(importCatalogueCsv(staff, 'category,product'))).toBe('VALIDATION');
    const c = await cat();
    const p = await prod(c.id, { summary: '=SUM(A1), risky' });
    await saveVariant(staff, p.id, null, { label: '1,000 L', sku: 'T-1', price: '100' });
    const out = await exportCatalogueCsv(staff);
    expect(out).toContain("'=SUM(A1)"); // never opens as a formula in a spreadsheet
    const before = await db.productVariant.count();
    await importCatalogueCsv(staff, out);
    expect(await db.productVariant.count()).toBe(before);
    expect(await db.product.count()).toBe(1);
  });
});
