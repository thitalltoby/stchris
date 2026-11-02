import 'server-only';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { db } from './db';
import { getSetting } from './settings';
import { notFound } from './errors';

const BURGUNDY = '#B4430A'; // St. Chris ember (darker brand orange): white text on it passes contrast
const BRAND = '#F96D11';
const CHARCOAL = '#211E1B';
const STEEL = '#5D5750';
const PAPER = '#F3F1EC';
const LINE = '#DDD6CB';

const money = (v: unknown, cur: string) => `${cur} ${Number(String(v)).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: unknown) => Number(String(v)).toLocaleString('en-GB', { maximumFractionDigits: 4 });
const date = (d: Date | null | undefined) => (d ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }).format(d) : '—');

export interface QuotationPdf {
  filename: string;
  buffer: Buffer;
}

/** Authorisation must be decided by the caller (staff scope or customer ownership + issued state). */
export async function renderQuotationPdf(revisionId: string): Promise<QuotationPdf> {
  const rev = await db.quotationRevision.findUnique({
    where: { id: revisionId },
    include: {
      lineItems: { orderBy: { sortOrder: 'asc' } },
      quotation: { include: { request: { include: { service: { select: { name: true } } } }, company: true, contact: true } },
    },
  });
  if (!rev) throw notFound('Quotation not found.');
  const company = await getSetting('company');
  const settings = await getSetting('quotes');
  const q = rev.quotation;
  const r = q.request;
  const issued = ['ISSUED', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN', 'SUPERSEDED'].includes(rev.status) && !!rev.issuedAt;

  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: `Quotation ${q.number} v${rev.version}`, Author: company.legalName, Subject: `Quotation for request ${r.reference}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width;
  const M = 48;
  const CW = W - M * 2;

  // Identity: the supplied logo (transparent PNG)
  doc.image(path.join(process.cwd(), 'public', 'brand', 'logo.png'), M, 38, { height: 58 });
  doc.font('Helvetica').fontSize(8.5).fillColor(STEEL).text([company.address, company.phone, company.email].filter(Boolean).join('\n'), W - M - 210, 46, { width: 210, align: 'right' });

  doc.moveTo(M, 112).lineTo(W - M, 112).lineWidth(1).strokeColor(BRAND).stroke();
  doc.font('Helvetica-Bold').fontSize(20).fillColor(CHARCOAL).text('QUOTATION', M, 126);
  doc.font('Helvetica').fontSize(9).fillColor(STEEL).text(`${q.number}  ·  Version ${rev.version}`, M, 150);

  // Meta + customer
  const boxY = 176;
  doc.rect(M, boxY, CW / 2 - 8, 92).fill(PAPER);
  doc.rect(M + CW / 2 + 8, boxY, CW / 2 - 8, 92).fill(PAPER);
  doc.fillColor(STEEL).font('Helvetica-Bold').fontSize(7.5).text('PREPARED FOR', M + 12, boxY + 10, { characterSpacing: 1 });
  doc.fillColor(CHARCOAL).font('Helvetica-Bold').fontSize(10.5).text(r.requesterName, M + 12, boxY + 24, { width: CW / 2 - 32 });
  doc.font('Helvetica').fontSize(9).fillColor(STEEL).text([r.companyName ?? q.company?.name, r.requesterEmail, r.requesterPhone].filter(Boolean).join('\n'), M + 12, boxY + 40, { width: CW / 2 - 32 });
  const mx = M + CW / 2 + 20;
  const meta: [string, string][] = [
    ['Request', r.reference],
    ['Service', r.service.name],
    ['Issue date', issued ? date(rev.issuedAt) : 'Not issued'],
    ['Valid until', issued ? date(rev.validUntil) : `${rev.validityDays} days from issue`],
  ];
  meta.forEach(([k, v], i) => {
    doc.font('Helvetica').fontSize(8.5).fillColor(STEEL).text(k, mx, boxY + 12 + i * 18, { width: 72, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(CHARCOAL).text(v, mx + 76, boxY + 12 + i * 18, { width: CW / 2 - 104, lineBreak: false, ellipsis: true });
  });

  let y = boxY + 112;
  if (rev.title) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(CHARCOAL).text(rev.title, M, y, { width: CW });
    y = doc.y + 6;
  }
  if (rev.introduction) {
    doc.font('Helvetica').fontSize(9.5).fillColor(CHARCOAL).text(rev.introduction, M, y, { width: CW, lineGap: 2 });
    y = doc.y + 14;
  }

  // Line items
  const cols = [
    { k: '#', w: 22, a: 'left' as const },
    { k: 'Description', w: CW - 22 - 44 - 52 - 82 - 38 - 38 - 88, a: 'left' as const },
    { k: 'Unit', w: 44, a: 'left' as const },
    { k: 'Qty', w: 52, a: 'right' as const },
    { k: 'Unit price', w: 82, a: 'right' as const },
    { k: 'Disc.', w: 38, a: 'right' as const },
    { k: 'Tax', w: 38, a: 'right' as const },
    { k: 'Amount', w: 88, a: 'right' as const },
  ];
  const header = (yy: number) => {
    doc.rect(M, yy, CW, 20).fill(BURGUNDY);
    let x = M;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
    for (const c of cols) {
      doc.text(c.k, x + 5, yy + 6, { width: c.w - 10, align: c.a, lineBreak: false });
      x += c.w;
    }
    return yy + 20;
  };
  y = header(y);
  rev.lineItems.forEach((l, i) => {
    const desc = l.description;
    doc.font('Helvetica').fontSize(9);
    const h = Math.max(doc.heightOfString(desc, { width: cols[1]!.w - 10 }) + 12, 24);
    if (y + h > doc.page.height - 190) {
      doc.addPage();
      y = header(48);
    }
    if (i % 2 === 1) doc.rect(M, y, CW, h).fill('#FAF9F6');
    const cells = [String(i + 1), desc, l.unit, num(l.quantity), num(l.unitPrice), Number(String(l.discountPercent)) ? `${num(l.discountPercent)}%` : '—', Number(String(l.taxPercent)) ? `${num(l.taxPercent)}%` : '—', Number(String(l.lineNet)).toLocaleString('en-GB', { minimumFractionDigits: 2 })];
    let x = M;
    doc.fillColor(CHARCOAL).fontSize(9);
    cols.forEach((c, ci) => {
      doc.font('Helvetica').text(cells[ci]!, x + 5, y + 6, { width: c.w - 10, align: c.a });
      x += c.w;
    });
    doc.moveTo(M, y + h).lineTo(W - M, y + h).lineWidth(0.5).strokeColor(LINE).stroke();
    y += h;
  });
  if (!rev.lineItems.length) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(STEEL).text('No line items yet.', M + 5, y + 8);
    y += 28;
  }

  // Totals
  if (y > doc.page.height - 230) {
    doc.addPage();
    y = 48;
  }
  y += 14;
  const tx = W - M - 230;
  const rows: [string, string, boolean][] = [
    ['Subtotal', money(rev.subtotal, rev.currency), false],
    ...(Number(String(rev.discountTotal)) ? ([['Discounts', `− ${money(rev.discountTotal, rev.currency)}`, false]] as [string, string, boolean][]) : []),
    ['Tax', money(rev.taxTotal, rev.currency), false],
  ];
  rows.forEach(([k, v]) => {
    doc.font('Helvetica').fontSize(9.5).fillColor(STEEL).text(k, tx, y, { width: 100, lineBreak: false });
    doc.fillColor(CHARCOAL).text(v, tx + 90, y, { width: 140, align: 'right', lineBreak: false });
    y += 17;
  });
  doc.rect(tx - 8, y - 2, 238, 28).fill(BURGUNDY);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF').text('Total', tx, y + 7, { width: 80, lineBreak: false });
  doc.text(money(rev.total, rev.currency), tx + 60, y + 7, { width: 170, align: 'right', lineBreak: false });
  y += 44;

  const block = (title: string, body?: string | null) => {
    if (!body?.trim()) return;
    doc.font('Helvetica').fontSize(9);
    const need = doc.heightOfString(body, { width: CW }) + 30;
    if (y + need > doc.page.height - 70) {
      doc.addPage();
      y = 48;
    }
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BURGUNDY).text(title.toUpperCase(), M, y, { characterSpacing: 1 });
    doc.font('Helvetica').fontSize(9).fillColor(CHARCOAL).text(body, M, y + 13, { width: CW, lineGap: 2 });
    y = doc.y + 14;
  };
  block('Payment terms', rev.paymentTerms);
  block('Terms and conditions', rev.terms);
  block('Acceptance', settings.customerCanRespond ? 'This quotation can be accepted or declined in the St. Chris Materials Desk customer portal. Acceptance is recorded against the signed-in customer account and this version of the quotation.' : 'Please contact St. Chris Global to confirm your acceptance of this quotation.');

  // Footer + draft watermark on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    if (!issued) {
      doc.save().rotate(-35, { origin: [W / 2, doc.page.height / 2] }).font('Helvetica-Bold').fontSize(80).fillColor('#B4430A').opacity(0.07).text('DRAFT', 0, doc.page.height / 2 - 40, { width: W, align: 'center', lineBreak: false }).restore();
      doc.opacity(1);
    }
    doc.font('Helvetica').fontSize(7.5).fillColor(STEEL).opacity(1);
    doc.moveTo(M, doc.page.height - 52).lineTo(W - M, doc.page.height - 52).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.text([company.legalName, company.address].filter(Boolean).join('  ·  '), M, doc.page.height - 44, { width: CW - 60, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, W - M - 60, doc.page.height - 44, { width: 60, align: 'right', lineBreak: false });
  }
  doc.end();
  const buffer = await done;
  return { filename: `${q.number}-v${rev.version}.pdf`, buffer };
}
