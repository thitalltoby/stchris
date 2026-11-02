import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { z } from 'zod';
import { db } from './db';
import { env } from './env';
import { randomToken, sha256 } from './crypto';
import { getSessionUser } from './session';
import { clientIp, rateLimit } from './rate-limit';
import { AppError, invalid, notFound } from './errors';

/**
 * The project list is the working basket. A visitor's list lives on the server, found by a random token in an
 * httpOnly cookie (stored hashed). Signing in or registering attaches it to the account, so a list started on a
 * phone is there on a laptop. Nothing about a list is a request or a commitment until it is sent for a quotation.
 */
export const LIST_COOKIE = 'stchris_list';
const LIST_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_LINES = 150;

export interface ListLine {
  id: string;
  productId: string | null;
  variantId: string | null;
  label: string;
  unit: string;
  quantity: number;
  note: string | null;
  /** Catalogue lines link back to their product page */
  href: string | null;
  /** The line's product is no longer published */
  unavailable: boolean;
}

export interface ListView { id: string | null; lines: ListLine[]; count: number }

const EMPTY: ListView = { id: null, lines: [], count: 0 };

async function findList(create: boolean) {
  const user = await getSessionUser();
  const jar = await cookies();
  const token = jar.get(LIST_COOKIE)?.value;
  if (user) {
    let list = await db.projectList.findFirst({ where: { userId: user.id, kind: 'ACTIVE' }, orderBy: { updatedAt: 'desc' } });
    // A guest list started before signing in joins the account's list
    if (token) {
      const guest = await db.projectList.findUnique({ where: { tokenHash: sha256(token) } });
      if (guest && !guest.userId) await mergeGuestList(guest.id, user.id);
      list = await db.projectList.findFirst({ where: { userId: user.id, kind: 'ACTIVE' }, orderBy: { updatedAt: 'desc' } });
      try { jar.delete(LIST_COOKIE); } catch { /* cookies can only change in actions; the merge is already saved */ }
    }
    if (!list && create) list = await db.projectList.create({ data: { userId: user.id } });
    return list;
  }
  if (token) {
    const l = await db.projectList.findUnique({ where: { tokenHash: sha256(token) } });
    if (l && !l.userId) return l;
  }
  if (!create) return null;
  const fresh = randomToken(24);
  const l = await db.projectList.create({ data: { tokenHash: sha256(fresh) } });
  jar.set(LIST_COOKIE, fresh, { httpOnly: true, sameSite: 'lax', secure: env.APP_URL.startsWith('https://'), path: '/', expires: new Date(Date.now() + LIST_TTL_MS) });
  return l;
}

async function mergeGuestList(guestId: string, userId: string) {
  await db.$transaction(async (tx) => {
    const target = await tx.projectList.findFirst({ where: { userId, kind: 'ACTIVE' } });
    if (!target) {
      await tx.projectList.update({ where: { id: guestId }, data: { userId, tokenHash: null } });
      return;
    }
    const [mine, theirs] = await Promise.all([tx.projectListItem.findMany({ where: { listId: target.id } }), tx.projectListItem.findMany({ where: { listId: guestId } })]);
    let order = mine.length;
    for (const it of theirs) {
      const same = it.productId ? mine.find((m) => m.productId === it.productId && m.variantId === it.variantId) : mine.find((m) => !m.productId && m.label.toLowerCase() === it.label.toLowerCase());
      if (same) await tx.projectListItem.update({ where: { id: same.id }, data: { quantity: { increment: it.quantity } } });
      else await tx.projectListItem.create({ data: { listId: target.id, productId: it.productId, variantId: it.variantId, label: it.label, unit: it.unit, quantity: it.quantity, note: it.note, sortOrder: order++ } });
    }
    await tx.projectList.delete({ where: { id: guestId } });
  });
}

/** The current visitor's list for display. Read-only (never creates a list or sets a cookie), so it is safe in any page. */
export const getListView = cache(async (): Promise<ListView> => {
  const user = await getSessionUser();
  const token = (await cookies()).get(LIST_COOKIE)?.value;
  let list: { id: string } | null = null;
  if (user) {
    // A guest list started before signing in joins the account's list (database only: the stale cookie is harmless)
    if (token) {
      const guest = await db.projectList.findFirst({ where: { tokenHash: sha256(token), userId: null }, select: { id: true } });
      if (guest) await mergeGuestList(guest.id, user.id).catch(() => undefined);
    }
    list = await db.projectList.findFirst({ where: { userId: user.id, kind: 'ACTIVE' }, orderBy: { updatedAt: 'desc' }, select: { id: true } });
  } else if (token) {
    list = await db.projectList.findFirst({ where: { tokenHash: sha256(token), userId: null }, select: { id: true } });
  }
  if (!list) return EMPTY;
  return viewOf(list.id);
});

async function viewOf(listId: string): Promise<ListView> {
  const items = await db.projectListItem.findMany({ where: { listId }, orderBy: { sortOrder: 'asc' } });
  const pids = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  const products = pids.length ? await db.product.findMany({ where: { id: { in: pids } }, select: { id: true, slug: true, status: true } }) : [];
  const lines = items.map((i) => {
    const p = i.productId ? products.find((x) => x.id === i.productId) : undefined;
    return { id: i.id, productId: i.productId, variantId: i.variantId, label: i.label, unit: i.unit, quantity: Number(i.quantity), note: i.note, href: p ? `/products/${p.slug}` : null, unavailable: !!i.productId && (!p || p.status !== 'PUBLISHED') };
  });
  return { id: listId, lines, count: lines.length };
}

const addSchema = z.object({
  productId: z.string().max(40).optional().default(''),
  variantId: z.string().max(40).optional().default(''),
  label: z.string().trim().max(200).optional().default(''),
  unit: z.string().trim().max(30).optional().default(''),
  quantity: z.coerce.number().positive('Enter a quantity above zero.').max(1e9, 'That quantity is too large.').default(1),
  note: z.string().trim().max(500).optional().default(''),
});

async function guard() {
  const ip = await clientIp();
  if (!(await rateLimit(`list:ip:${ip}`, 240, 10 * 60))) throw new AppError('RATE_LIMITED', 'Too many changes to your list in a short time. Please wait a moment.');
}

/** Add a catalogue product (with optional size) or a free-text line. Adding something already on the list raises its quantity. */
export async function addToList(raw: unknown): Promise<ListView> {
  await guard();
  const p = addSchema.safeParse(raw);
  if (!p.success) throw invalid(p.error.issues[0]?.message ?? 'Check the item and try again.', Object.fromEntries(p.error.issues.map((i) => [i.path.join('.'), i.message])));
  const d = p.data;
  let label = d.label, unit = d.unit || 'each', productId: string | null = null, variantId: string | null = null;
  if (d.productId) {
    const prod = await db.product.findFirst({ where: { id: d.productId, status: 'PUBLISHED' }, include: { variants: true } });
    if (!prod) throw notFound('That product is no longer available.');
    productId = prod.id;
    const v = d.variantId ? prod.variants.find((x) => x.id === d.variantId && x.visible) : undefined;
    if (d.variantId && !v) throw invalid('Choose one of the listed sizes.', { variantId: 'Not available.' });
    variantId = v?.id ?? null;
    label = v ? `${prod.name}: ${v.label}` : prod.name;
    unit = v?.unit ?? unit;
  } else if (label.length < 2) {
    throw invalid('Name the item you need.', { label: 'Required.' });
  }
  const list = await findList(true);
  if (!list) throw notFound('Your list could not be opened.');
  const count = await db.projectListItem.count({ where: { listId: list.id } });
  const existing = await db.projectListItem.findFirst({ where: productId ? { listId: list.id, productId, variantId } : { listId: list.id, productId: null, label: { equals: label, mode: 'insensitive' } } });
  if (existing) await db.projectListItem.update({ where: { id: existing.id }, data: { quantity: { increment: d.quantity }, ...(d.note ? { note: d.note } : {}) } });
  else {
    if (count >= MAX_LINES) throw invalid(`A list holds up to ${MAX_LINES} lines. Send this one for a quotation, then start another.`);
    await db.projectListItem.create({ data: { listId: list.id, productId, variantId, label, unit, quantity: d.quantity, note: d.note || null, sortOrder: count } });
  }
  await db.projectList.update({ where: { id: list.id }, data: { updatedAt: new Date() } });
  return viewOf(list.id);
}

async function ownedItem(itemId: string) {
  const list = await findList(false);
  if (!list) throw notFound('That line is not on your list.');
  const item = await db.projectListItem.findFirst({ where: { id: itemId, listId: list.id } });
  if (!item) throw notFound('That line is not on your list.');
  return { list, item };
}

export async function updateListItem(itemId: string, input: { quantity?: unknown; note?: unknown; unit?: unknown }): Promise<ListView> {
  await guard();
  const { list, item } = await ownedItem(itemId);
  const data: { quantity?: number; note?: string | null; unit?: string } = {};
  if (input.quantity !== undefined) {
    const q = Number(input.quantity);
    if (!Number.isFinite(q) || q <= 0 || q > 1e9) throw invalid('Enter a quantity above zero.', { quantity: 'Enter a quantity above zero.' });
    data.quantity = q;
  }
  if (input.note !== undefined) data.note = String(input.note).trim().slice(0, 500) || null;
  if (input.unit !== undefined && !item.productId) data.unit = String(input.unit).trim().slice(0, 30) || 'each';
  await db.projectListItem.update({ where: { id: item.id }, data });
  return viewOf(list.id);
}

export async function removeListItem(itemId: string): Promise<ListView> {
  await guard();
  const { list, item } = await ownedItem(itemId);
  await db.projectListItem.delete({ where: { id: item.id } });
  return viewOf(list.id);
}

export async function clearList(): Promise<void> {
  const list = await findList(false);
  if (list) await db.projectListItem.deleteMany({ where: { listId: list.id } });
}

/** Called when a signed-in or registering visitor should keep their guest list. */
export async function adoptGuestList(userId: string): Promise<void> {
  const token = (await cookies()).get(LIST_COOKIE)?.value;
  if (!token) return;
  const guest = await db.projectList.findUnique({ where: { tokenHash: sha256(token) } });
  if (guest && !guest.userId) await mergeGuestList(guest.id, userId);
  try { (await cookies()).delete(LIST_COOKIE); } catch { /* not in an action */ }
}

/** The lines of the visitor's list in the shape the request form submits. */
export async function listAsItems() {
  const v = await getListView();
  return v.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, label: l.label, unit: l.unit, quantity: l.quantity, note: l.note ?? '' }));
}

/** Pre-fill a new list from an earlier request (reorder). Replaces nothing: lines are added to the current list. */
export async function addLinesFromRequest(lines: { productId: string | null; variantId: string | null; label: string; unit: string; quantity: number; note: string | null }[]): Promise<ListView> {
  let view: ListView = EMPTY;
  for (const l of lines) {
    try {
      view = await addToList({ productId: l.productId ?? '', variantId: l.variantId ?? '', label: l.label, unit: l.unit, quantity: l.quantity, note: l.note ?? '' });
    } catch {
      // a product that has since been removed becomes a plain line so nothing silently disappears
      view = await addToList({ label: l.label, unit: l.unit, quantity: l.quantity, note: l.note ?? '' });
    }
  }
  return view;
}
