import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { getSessionUser } from '@/server/session';
import { customerRequestScope, staffRequestScope } from '@/server/rbac';
import { can, isStaff } from '@/lib/permissions';
import { renderQuotationPdf } from '@/server/pdf';
import { CUSTOMER_VISIBLE } from '@/server/quotations';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const deny = () => new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

/** Quotation PDF. Staff see drafts (watermarked); customers see only revisions that were issued to them. */
export async function GET(_: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  const { revisionId } = await params;
  const user = await getSessionUser();
  if (!user) return deny();
  const rev = await db.quotationRevision.findUnique({ where: { id: revisionId }, include: { quotation: { select: { requestId: true } } } });
  if (!rev) return deny();
  const scope = isStaff(user.role) ? staffRequestScope(user) : customerRequestScope(user.id);
  const visible = await db.quoteRequest.findFirst({ where: { AND: [{ id: rev.quotation.requestId }, scope] }, select: { id: true } });
  if (!visible) return deny();
  if (isStaff(user.role) ? !can(user.role, 'quotation.view') : !CUSTOMER_VISIBLE.includes(rev.status)) return deny();
  const pdf = await renderQuotationPdf(revisionId);
  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${pdf.filename}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' },
  });
}
