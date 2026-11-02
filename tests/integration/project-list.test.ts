import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { db } from '@/server/db';
import { AppError } from '@/server/errors';
import { __jar } from '../next-headers-stub';
import { createSession } from '@/server/session';
import { resetDb, makeUser, makeService, submission } from './helpers';
import { addToList, updateListItem, removeListItem, clearList, getListView, listAsItems, addLinesFromRequest, LIST_COOKIE, MAX_LINES } from '@/server/project-list';
import { submitRequest } from '@/server/requests';

const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof AppError ? e.code : `ERR:${e}`));

let productId: string;
let variantId: string;

beforeAll(async () => { await resetDb(); });
beforeEach(async () => {
  await resetDb();
  __jar.clear();
  const c = await db.category.create({ data: { name: 'Water tanks', slug: 'water-tanks', summary: 'Tanks.' } });
  const p = await db.product.create({ data: { name: 'Black tank', slug: 'black-tank', categoryId: c.id, summary: 'A tank.', status: 'PUBLISHED' } });
  const v = await db.productVariant.create({ data: { productId: p.id, label: '1,000 L', unit: 'each', sku: 'T-1000' } });
  productId = p.id; variantId = v.id;
});

describe('project list', () => {
  it('starts empty and does not create a list or cookie just by being looked at', async () => {
    expect((await getListView()).count).toBe(0);
    expect(__jar.has(LIST_COOKIE)).toBe(false);
    expect(await db.projectList.count()).toBe(0);
  });

  it('adds a catalogue size with its label and unit taken from the catalogue, and keeps the token hashed', async () => {
    const v = await addToList({ productId, variantId, quantity: 4, label: 'Cheap tank', unit: 'kg' }); // browser-supplied text is ignored
    expect(v.lines).toHaveLength(1);
    expect(v.lines[0]).toMatchObject({ label: 'Black tank: 1,000 L', unit: 'each', quantity: 4, href: '/products/black-tank', unavailable: false });
    const token = __jar.get(LIST_COOKIE)!;
    expect(token.length).toBeGreaterThan(20);
    expect((await db.projectList.findFirstOrThrow()).tokenHash).not.toBe(token);
  });

  it('adding the same line again raises the quantity instead of duplicating it', async () => {
    await addToList({ productId, variantId, quantity: 2 });
    const v = await addToList({ productId, variantId, quantity: 3 });
    expect(v.lines).toHaveLength(1);
    expect(v.lines[0]!.quantity).toBe(5);
    await addToList({ label: '20mm PVC pipe', unit: 'length', quantity: 10 });
    const w = await addToList({ label: '20MM pvc PIPE', quantity: 5 });
    expect(w.lines).toHaveLength(2);
    expect(w.lines[1]!.quantity).toBe(15);
  });

  it('refuses unavailable products, unknown sizes, bad quantities and unnamed lines', async () => {
    await db.product.update({ where: { id: productId }, data: { status: 'DRAFT' } });
    expect(await code(addToList({ productId, quantity: 1 }))).toBe('NOT_FOUND');
    await db.product.update({ where: { id: productId }, data: { status: 'PUBLISHED' } });
    expect(await code(addToList({ productId, variantId: 'nope', quantity: 1 }))).toBe('VALIDATION');
    expect(await code(addToList({ productId, quantity: 0 }))).toBe('VALIDATION');
    expect(await code(addToList({ productId, quantity: -2 }))).toBe('VALIDATION');
    expect(await code(addToList({ label: 'x', quantity: 1 }))).toBe('VALIDATION');
  });

  it('edits and removes only lines on the visitor’s own list', async () => {
    const v = await addToList({ label: 'Cement', unit: 'bag', quantity: 10 });
    const id = v.lines[0]!.id;
    const u = await updateListItem(id, { quantity: 25, note: 'Dangote 42.5', unit: 'tonne' });
    expect(u.lines[0]).toMatchObject({ quantity: 25, note: 'Dangote 42.5', unit: 'tonne' });
    expect(await code(updateListItem(id, { quantity: 0 }))).toBe('VALIDATION');
    // somebody else's list
    const other = await db.projectList.create({ data: { tokenHash: 'other' } });
    const theirs = await db.projectListItem.create({ data: { listId: other.id, label: 'Their item', unit: 'each', quantity: 1 } });
    expect(await code(updateListItem(theirs.id, { quantity: 9 }))).toBe('NOT_FOUND');
    expect(await code(removeListItem(theirs.id))).toBe('NOT_FOUND');
    expect((await removeListItem(id)).count).toBe(0);
  });

  it('keeps the catalogue unit on catalogue lines when the unit is edited', async () => {
    const v = await addToList({ productId, variantId, quantity: 1 });
    const u = await updateListItem(v.lines[0]!.id, { unit: 'kg' });
    expect(u.lines[0]!.unit).toBe('each');
  });

  it('holds at most MAX_LINES distinct lines', async () => {
    const list = await db.projectList.create({ data: { tokenHash: 'x' } });
    // build the full list directly, then try one more through the real path
    await db.projectListItem.createMany({ data: Array.from({ length: MAX_LINES }, (_, i) => ({ listId: list.id, label: `Item ${i}`, unit: 'each', quantity: 1, sortOrder: i })) });
    __jar.set(LIST_COOKIE, 'x');
    const { sha256 } = await import('@/server/crypto');
    await db.projectList.update({ where: { id: list.id }, data: { tokenHash: sha256('x') } });
    expect(await code(addToList({ label: 'One too many', quantity: 1 }))).toBe('VALIDATION');
    expect((await addToList({ label: 'Item 3', quantity: 1 })).count).toBe(MAX_LINES); // raising an existing line is still fine
  });

  it('joins a guest list to the account on sign-in, summing matching lines', async () => {
    const user = await makeUser('CUSTOMER');
    const mine = await db.projectList.create({ data: { userId: user.id } });
    await db.projectListItem.create({ data: { listId: mine.id, productId, variantId, label: 'Black tank: 1,000 L', unit: 'each', quantity: 2 } });
    await addToList({ productId, variantId, quantity: 3 }); // as a guest
    await addToList({ label: 'Cement', unit: 'bag', quantity: 10 });
    expect(await db.projectList.count()).toBe(2);
    await createSession(user);
    const v = await getListView();
    expect(v.count).toBe(2);
    expect(v.lines.find((l) => l.productId === productId)!.quantity).toBe(5);
    expect(await db.projectList.count()).toBe(1);
    expect((await db.projectList.findFirstOrThrow()).userId).toBe(user.id);
  });

  it('turns a guest list into the signed-in visitor’s list when they had none', async () => {
    await addToList({ label: 'Cement', unit: 'bag', quantity: 10 });
    const user = await makeUser('CUSTOMER');
    await createSession(user);
    expect((await getListView()).count).toBe(1);
    expect((await db.projectList.findFirstOrThrow()).userId).toBe(user.id);
  });

  it('clears the list', async () => {
    await addToList({ label: 'Cement', quantity: 1 });
    await clearList();
    expect((await getListView()).count).toBe(0);
  });
});

describe('sending a list as a request', () => {
  let serviceId: string;
  beforeEach(async () => {
    const s = await makeService();
    await db.service.update({ where: { id: s.id }, data: { acceptsItems: true } });
    serviceId = s.id;
  });

  it('copies catalogue lines onto the request using catalogue wording, not the browser’s', async () => {
    const r = await submitRequest(submission(serviceId, {
      details: { capacity: '1', product: 'x' },
      items: [
        { productId, variantId, label: 'Tampered label', unit: 'kg', quantity: 3, note: 'Deliver to site' },
        { label: '12mm rebar', unit: 'tonne', quantity: 2 },
      ],
    }));
    const items = await db.quoteRequestItem.findMany({ where: { requestId: r.id }, orderBy: { sortOrder: 'asc' } });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ label: 'Black tank: 1,000 L', unit: 'each', sku: 'T-1000', productId, variantId });
    expect(Number(items[0]!.quantity)).toBe(3);
    expect(items[1]).toMatchObject({ label: '12mm rebar', unit: 'tonne', productId: null, sku: null });
    const req = await db.quoteRequest.findUniqueOrThrow({ where: { id: r.id } });
    expect(req.summary).toContain('2 lines');
  });

  it('refuses an empty list for a request type that needs items, and a product that is no longer published', async () => {
    expect(await code(submitRequest(submission(serviceId, { items: [] })))).toBe('VALIDATION');
    await db.product.update({ where: { id: productId }, data: { status: 'DRAFT' } });
    expect(await code(submitRequest(submission(serviceId, { items: [{ productId, label: 'Black tank', unit: 'each', quantity: 1 }] })))).toBe('VALIDATION');
    expect(await db.quoteRequest.count()).toBe(0);
  });

  it('keeps the request’s lines when the product is later deleted', async () => {
    const r = await submitRequest(submission(serviceId, { items: [{ productId, variantId, label: 'Tank', unit: 'each', quantity: 1 }] }));
    await db.product.delete({ where: { id: productId } });
    const item = await db.quoteRequestItem.findFirstOrThrow({ where: { requestId: r.id } });
    expect(item.label).toBe('Black tank: 1,000 L');
    expect(item.sku).toBe('T-1000'); // the request keeps its own copy of what was asked
  });

  it('turns an earlier request back into list lines (reorder), keeping removed products as plain lines', async () => {
    const r = await submitRequest(submission(serviceId, { items: [{ productId, variantId, label: 'Tank', unit: 'each', quantity: 4 }, { label: 'Cement', unit: 'bag', quantity: 10 }] }));
    await db.product.update({ where: { id: productId }, data: { status: 'DRAFT' } });
    const lines = await db.quoteRequestItem.findMany({ where: { requestId: r.id }, orderBy: { sortOrder: 'asc' } });
    const v = await addLinesFromRequest(lines.map((l) => ({ productId: l.productId, variantId: l.variantId, label: l.label, unit: l.unit, quantity: Number(l.quantity), note: l.note })));
    expect(v.lines.map((l) => [l.label, l.quantity])).toEqual([['Black tank: 1,000 L', 4], ['Cement', 10]]);
    expect(v.lines[0]!.productId).toBeNull();
    expect((await listAsItems()).length).toBe(2);
  });
});
