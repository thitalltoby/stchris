import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from './env';
import { hmac, safeEqual, sha256 } from './crypto';
import { invalid } from './errors';
import { scanBuffer, recordUploadBlocked } from './scan';
import type { ScanStatus } from '@/generated/prisma/enums';

export { MAX_FILE_BYTES, MAX_FILES_PER_UPLOAD, ALLOWED_LABEL, ACCEPT_ATTR } from '@/lib/upload-rules';
import { MAX_FILE_BYTES, ALLOWED_LABEL } from '@/lib/upload-rules';

export const ALLOWED_TYPES: Record<string, { mime: string[]; label: string }> = {
  pdf: { mime: ['application/pdf'], label: 'PDF' },
  png: { mime: ['image/png'], label: 'PNG' },
  jpg: { mime: ['image/jpeg'], label: 'JPG' },
  jpeg: { mime: ['image/jpeg'], label: 'JPEG' },
  docx: { mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], label: 'Word' },
  xlsx: { mime: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], label: 'Excel' },
  csv: { mime: ['text/csv', 'application/vnd.ms-excel', 'text/plain'], label: 'CSV' },
  txt: { mime: ['text/plain'], label: 'Text' },
};

const root = () => path.resolve(env.STORAGE_DIR);

function sniff(buf: Buffer, ext: string): boolean {
  const head = buf.subarray(0, 8);
  switch (ext) {
    case 'pdf': return head.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'png': return head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'jpg':
    case 'jpeg': return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case 'docx':
    case 'xlsx': return head[0] === 0x50 && head[1] === 0x4b; // OOXML is a zip container
    case 'csv':
    case 'txt': return !buf.subarray(0, 4096).includes(0); // no NUL bytes in text
    default: return false;
  }
}

export function safeFileName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ()]+/g, '_').replace(/\s+/g, ' ').trim();
  return base.slice(-120) || 'file';
}

export interface StoredFile {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  scanStatus: ScanStatus;
  scanEngine: string;
  scanDetail: string;
  scannedAt: Date;
}

/** Validate (extension, declared type, size, magic bytes) and write to private storage. */
export async function saveUpload(file: { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<StoredFile> {
  const name = safeFileName(file.name);
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const rule = ALLOWED_TYPES[ext];
  if (!rule) throw invalid(`“${name}” is not an accepted file type. Accepted: ${ALLOWED_LABEL}.`);
  if (file.size === 0) throw invalid(`“${name}” is empty.`);
  if (file.size > MAX_FILE_BYTES) throw invalid(`“${name}” is larger than 10 MB.`);
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_FILE_BYTES) throw invalid(`“${name}” is larger than 10 MB.`);
  if (!sniff(buf, ext)) throw invalid(`“${name}” does not look like a valid ${rule.label} file.`);
  // Scan before anything is written. A threat is refused outright; if the scanner is down the file is kept but held (never served) and re-scanned later.
  const scan = await scanBuffer(buf, ext);
  if (scan.status === 'INFECTED') {
    await recordUploadBlocked(name, scan.detail);
    throw invalid(`“${name}” was blocked because it failed the security scan (${scan.detail}).`);
  }
  const d = new Date();
  const key = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.bin`;
  const full = path.join(root(), key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buf, { mode: 0o600 });
  return { storageKey: key, originalName: name, mimeType: rule.mime[0]!, sizeBytes: buf.length, sha256: sha256(buf), scanStatus: scan.status, scanEngine: scan.engine, scanDetail: scan.detail, scannedAt: new Date() };
}

export async function readStored(key: string): Promise<Buffer> {
  const full = path.resolve(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new Error('Invalid storage key');
  return fs.readFile(full);
}

export async function deleteStored(key: string): Promise<void> {
  const full = path.resolve(root(), key);
  if (!full.startsWith(root() + path.sep)) return;
  await fs.rm(full, { force: true });
}

/** Short-lived, user-bound download URL. Authorisation is decided when the URL is minted and re-checked on download. */
export function signedFileUrl(documentId: string, userId: string, ttlSeconds = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = hmac(`${documentId}.${userId}.${exp}`, 'file');
  return `/files/${documentId}?uid=${encodeURIComponent(userId)}&exp=${exp}&sig=${sig}`;
}

export function verifyFileSignature(documentId: string, userId: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(sig, hmac(`${documentId}.${userId}.${exp}`, 'file'));
}
