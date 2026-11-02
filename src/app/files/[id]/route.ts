import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { getSessionUser } from '@/server/session';
import { readStored, verifyFileSignature } from '@/server/storage';
import { customerRequestScope, staffRequestScope } from '@/server/rbac';
import { can, isStaff } from '@/lib/permissions';
import { audit } from '@/server/audit';
import { isServable } from '@/server/scan';

export const dynamic = 'force-dynamic';

const deny = () => new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

/**
 * Private document download. Three independent checks: a valid signature minted for this user and document,
 * a live session for that same user, and a row-level access check on the document itself.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid') ?? '';
  const exp = Number(url.searchParams.get('exp'));
  const sig = url.searchParams.get('sig') ?? '';
  if (!verifyFileSignature(id, uid, exp, sig)) return deny();
  const user = await getSessionUser();
  if (!user || user.id !== uid) return deny();

  const doc = await db.document.findUnique({ where: { id }, include: { request: { select: { id: true } } } });
  if (!doc) return deny();

  let allowed = false;
  if (isStaff(user.role)) {
    if (doc.requestId) allowed = !!(await db.quoteRequest.findFirst({ where: { AND: [{ id: doc.requestId }, staffRequestScope(user)] }, select: { id: true } }));
    else allowed = can(user.role, 'customer.view');
  } else if (doc.visibility === 'CUSTOMER' && doc.requestId) {
    allowed = !!(await db.quoteRequest.findFirst({ where: { AND: [{ id: doc.requestId }, customerRequestScope(user.id)] }, select: { id: true } }));
  }
  if (!allowed) return deny();
  // Held or quarantined files are never served
  if (!isServable(doc.scanStatus)) return new NextResponse('This file is not available: it is waiting for, or failed, the security scan.', { status: 423, headers: { 'Cache-Control': 'no-store' } });

  let data: Buffer;
  try {
    data = await readStored(doc.storageKey);
  } catch {
    return deny();
  }
  await audit({ id: user.id, label: user.name }, 'document.downloaded', 'Document', doc.id, { name: doc.originalName }).catch(() => undefined);
  const safeName = doc.originalName.replace(/[^\w.\- ()]/g, '_');
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': doc.mimeType,
      'Content-Length': String(data.length),
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
