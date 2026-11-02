import 'server-only';
import net from 'node:net';
import { db } from './db';
import { env } from './env';
import { audit } from './audit';
import { readStored } from './storage';

/**
 * Upload scanning, in two layers.
 *
 *  1. Built-in checks (always on): the standard EICAR test signature, executable code hidden in a document,
 *     macro payloads in Office files that should not have macros, PDF launch actions, and zip bombs.
 *     These catch obvious abuse. They are not an antivirus engine.
 *  2. ClamAV (when CLAMAV_HOST is set): the file is streamed to a clamd daemon, which checks it against the
 *     ClamAV signature database. This is what makes the scan a real virus scan.
 */

export type ScanOutcome =
  | { status: 'CLEAN'; engine: 'builtin' | 'clamav'; detail: string }
  | { status: 'INFECTED'; engine: 'builtin' | 'clamav'; detail: string }
  | { status: 'ERROR'; engine: 'clamav'; detail: string };

export const clamEnabled = () => !!env.CLAMAV_HOST;

// ─── Built-in checks ──────────────────────────────────────────────────

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const MAX_UNCOMPRESSED = 300 * 1024 * 1024;

function executableKind(b: Buffer): string | null {
  if (b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a) return 'Windows executable (MZ)';
  if (b.length >= 4 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) return 'Linux executable (ELF)';
  if (b.length >= 4) {
    const m = b.readUInt32BE(0);
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(m)) return 'macOS/Java executable';
  }
  if (b.length >= 2 && b[0] === 0x23 && b[1] === 0x21) return 'script (#!)';
  return null;
}

/** Entries of a zip central directory: file name and sizes. Returns null when the structure is unreadable. */
function zipEntries(buf: Buffer): Array<{ name: string; csize: number; usize: number }> | null {
  const min = Math.max(0, buf.length - 65557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: Array<{ name: string; csize: number; usize: number }> = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null;
    const csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    out.push({ name: buf.subarray(p + 46, p + 46 + nl).toString('utf8'), csize, usize });
    p += 46 + nl + el + cl;
  }
  return out;
}

export function builtinScan(buf: Buffer, ext: string): { infected: false } | { infected: true; detail: string } {
  const head = buf.subarray(0, 8192).toString('latin1');
  if (buf.toString('latin1').includes(EICAR)) return { infected: true, detail: 'EICAR test signature' };
  // none of the accepted types is an executable
  const exe = executableKind(buf);
  if (exe) return { infected: true, detail: `Contains a ${exe}, not a document` };
  if (ext === 'pdf') {
    const all = buf.toString('latin1');
    if (/\/Launch\b/.test(all)) return { infected: true, detail: 'PDF launch action' };
    if (/\/EmbeddedFile\b/.test(all) && /\.(exe|bat|cmd|scr|js|vbs|ps1)\b/i.test(all)) return { infected: true, detail: 'PDF with an embedded program' };
  }
  if (ext === 'docx' || ext === 'xlsx') {
    const entries = zipEntries(buf);
    if (!entries) return { infected: true, detail: 'Damaged or malformed Office file' };
    if (entries.some((e) => /(^|\/)vbaProject\.bin$/i.test(e.name))) return { infected: true, detail: 'Contains macros (not allowed in .docx/.xlsx)' };
    if (entries.some((e) => /\.(exe|dll|bat|cmd|scr|vbs|js|ps1|jar)$/i.test(e.name) || /(^|\/)activeX\//i.test(e.name))) return { infected: true, detail: 'Contains an embedded program or ActiveX control' };
    const total = entries.reduce((a, e) => a + e.usize, 0);
    if (total > MAX_UNCOMPRESSED || entries.some((e) => e.csize > 0 && e.usize / e.csize > 1000 && e.usize > 50 * 1024 * 1024)) return { infected: true, detail: 'Suspicious compression ratio (possible zip bomb)' };
  }
  if ((ext === 'csv' || ext === 'txt') && /<script\b/i.test(head)) return { infected: true, detail: 'Contains script markup' };
  return { infected: false };
}

// ─── ClamAV (clamd INSTREAM) ──────────────────────────────────────────

export function clamdScan(buf: Buffer, host: string, port: number, timeoutMs = 30_000): Promise<{ infected: boolean; detail: string }> {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port });
    const chunks: Buffer[] = [];
    let done = false;
    const finish = (fn: () => void) => { if (!done) { done = true; sock.destroy(); fn(); } };
    sock.setTimeout(timeoutMs, () => finish(() => reject(new Error('ClamAV did not answer in time.'))));
    sock.on('error', (e) => finish(() => reject(new Error(`Cannot reach ClamAV at ${host}:${port} (${(e as NodeJS.ErrnoException).code ?? e.message}).`))));
    sock.on('data', (d) => chunks.push(d));
    sock.on('end', () => finish(() => {
      const reply = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
      if (/OK$/.test(reply)) return resolve({ infected: false, detail: 'ClamAV: no threat found' });
      const found = /: (.+) FOUND$/.exec(reply);
      if (found) return resolve({ infected: true, detail: `ClamAV: ${found[1]}` });
      reject(new Error(`Unexpected ClamAV reply: ${reply.slice(0, 120) || '(empty)'}`));
    }));
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      const CHUNK = 64 * 1024;
      for (let i = 0; i < buf.length; i += CHUNK) {
        const part = buf.subarray(i, i + CHUNK);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length);
        sock.write(len);
        sock.write(part);
      }
      sock.write(Buffer.alloc(4)); // zero-length chunk ends the stream
    });
  });
}

export async function scanBuffer(buf: Buffer, ext: string): Promise<ScanOutcome> {
  const b = builtinScan(buf, ext);
  if (b.infected) return { status: 'INFECTED', engine: 'builtin', detail: b.detail };
  if (!clamEnabled()) return { status: 'CLEAN', engine: 'builtin', detail: 'Basic checks passed (no antivirus engine connected)' };
  try {
    const c = await clamdScan(buf, env.CLAMAV_HOST, env.CLAMAV_PORT);
    return c.infected ? { status: 'INFECTED', engine: 'clamav', detail: c.detail } : { status: 'CLEAN', engine: 'clamav', detail: c.detail };
  } catch (e) {
    return { status: 'ERROR', engine: 'clamav', detail: e instanceof Error ? e.message : 'Scan failed.' };
  }
}

// ─── Serving rules and re-scans ───────────────────────────────────────

/** Files are served only once scanned clean (or when they pre-date scanning). */
export const isServable = (status: string) => status === 'CLEAN' || status === 'UNSCANNED';

export const SCAN_LABELS: Record<string, string> = {
  PENDING: 'Waiting for virus scan',
  CLEAN: 'Scanned: clean',
  INFECTED: 'Blocked: threat found',
  ERROR: 'Held: scanner unavailable',
  UNSCANNED: 'Uploaded before scanning existed',
};

export async function recordUploadBlocked(name: string, detail: string) {
  await audit({ id: null, label: 'System' }, 'upload.blocked', 'Upload', null, { name, detail }).catch(() => undefined);
}

/**
 * Re-scan documents that are held (scanner was down) or were never scanned. Called from the maintenance job.
 * Documents that were never scanned are only re-scanned when a real engine is connected.
 */
export async function rescanHeldDocuments(limit = 25): Promise<number> {
  const statuses: Array<'PENDING' | 'ERROR' | 'UNSCANNED'> = clamEnabled() ? ['PENDING', 'ERROR', 'UNSCANNED'] : ['PENDING', 'ERROR'];
  const docs = await db.document.findMany({ where: { scanStatus: { in: statuses } }, orderBy: { createdAt: 'asc' }, take: limit });
  let n = 0;
  for (const d of docs) {
    let buf: Buffer;
    try { buf = await readStored(d.storageKey); } catch { continue; }
    const ext = d.originalName.includes('.') ? d.originalName.split('.').pop()!.toLowerCase() : '';
    const r = await scanBuffer(buf, ext);
    await db.document.update({ where: { id: d.id }, data: { scanStatus: r.status, scanEngine: r.engine, scanDetail: r.detail, scannedAt: new Date() } });
    if (r.status === 'INFECTED') await audit({ id: null, label: 'System' }, 'document.quarantined', 'Document', d.id, { name: d.originalName, detail: r.detail });
    n++;
  }
  return n;
}
