import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import { db } from '@/server/db';
import { saveUpload } from '@/server/storage';
import { builtinScan, clamdScan, scanBuffer, rescanHeldDocuments, isServable } from '@/server/scan';
import { getEnv } from '@/server/env';
import { AppError } from '@/server/errors';
import { resetDb, makeService, submission } from './helpers';
import { submitRequest } from '@/server/requests';

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const file = (name: string, content: Buffer | string, type = 'application/octet-stream') => new File([new Uint8Array(typeof content === 'string' ? Buffer.from(content) : content)], name, { type });
const pdf = (extra = '') => Buffer.from(`%PDF-1.4\n${extra}\n%%EOF\n`);

/** Minimal zip with the given entry names (stored, no compression) */
function zip(names: string[]): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const n of names) {
    const name = Buffer.from(n);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    off += lh.length + name.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** A tiny fake clamd: answers FOUND when the stream contains the EICAR string, OK otherwise */
function fakeClamd(mode: 'normal' | 'garbage' = 'normal'): Promise<{ port: number; close: () => void; requests: number[] }> {
  const requests: number[] = [];
  return new Promise((resolve) => {
    const server = net.createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        if (!buf.subarray(0, 10).equals(Buffer.from('zINSTREAM\0'))) return;
        let p = 10, body = Buffer.alloc(0);
        for (;;) {
          if (p + 4 > buf.length) return;
          const len = buf.readUInt32BE(p);
          if (len === 0) break;
          if (p + 4 + len > buf.length) return;
          body = Buffer.concat([body, buf.subarray(p + 4, p + 4 + len)]);
          p += 4 + len;
        }
        requests.push(body.length);
        sock.end(mode === 'garbage' ? 'what\0' : body.toString('latin1').includes('EICAR-STANDARD') ? 'stream: Win.Test.EICAR_HDB-1 FOUND\0' : 'stream: OK\0');
      });
    }).listen(0, '127.0.0.1', () => resolve({ port: (server.address() as net.AddressInfo).port, close: () => server.close(), requests }));
  });
}

beforeEach(async () => { await resetDb(); });
afterEach(() => { process.env.CLAMAV_HOST = ''; (getEnv() as { CLAMAV_HOST: string }).CLAMAV_HOST = ''; });

const useClam = (port: number) => { (getEnv() as { CLAMAV_HOST: string; CLAMAV_PORT: number }).CLAMAV_HOST = '127.0.0.1'; (getEnv() as { CLAMAV_PORT: number }).CLAMAV_PORT = port; };

describe('built-in checks', () => {
  it('flags the EICAR test file, executables, launch actions and macros; passes ordinary files', () => {
    expect(builtinScan(Buffer.from(EICAR), 'txt')).toMatchObject({ infected: true });
    expect(builtinScan(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]), 'pdf')).toMatchObject({ infected: true });
    expect(builtinScan(Buffer.from('#!/bin/sh\nrm -rf /'), 'txt')).toMatchObject({ infected: true });
    expect(builtinScan(pdf('<< /S /Launch /F (cmd.exe) >>'), 'pdf')).toMatchObject({ infected: true, detail: 'PDF launch action' });
    expect(builtinScan(zip(['[Content_Types].xml', 'word/document.xml', 'word/vbaProject.bin']), 'docx')).toMatchObject({ infected: true });
    expect(builtinScan(zip(['[Content_Types].xml', 'xl/embeddings/run.exe']), 'xlsx')).toMatchObject({ infected: true });
    expect(builtinScan(Buffer.from('not a zip at all'), 'docx')).toMatchObject({ infected: true });
    expect(builtinScan(pdf('hello'), 'pdf')).toEqual({ infected: false });
    expect(builtinScan(zip(['[Content_Types].xml', 'word/document.xml']), 'docx')).toEqual({ infected: false });
    expect(builtinScan(Buffer.from('name,qty\nsand,10\n'), 'csv')).toEqual({ infected: false });
  });
});

describe('upload', () => {
  it('refuses a threat and stores nothing; accepts a clean file with its scan record', async () => {
    let err: unknown;
    await saveUpload(file('invoice.txt', EICAR, 'text/plain')).catch((e) => (err = e));
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).message).toMatch(/blocked/);
    expect(await db.auditEvent.count({ where: { action: 'upload.blocked' } })).toBe(1);
    const ok = await saveUpload(file('spec.pdf', pdf(), 'application/pdf'));
    expect(ok).toMatchObject({ scanStatus: 'CLEAN', scanEngine: 'builtin' });
  });

  it('attaches the scan result to documents created from a request', async () => {
    const svc = await makeService();
    const res = await submitRequest(submission(svc.id), { files: [file('spec.pdf', pdf(), 'application/pdf')] });
    const d = await db.document.findFirstOrThrow({ where: { requestId: res.id } });
    expect(d.scanStatus).toBe('CLEAN');
    expect(isServable(d.scanStatus)).toBe(true);
  });
});

describe('ClamAV (clamd protocol)', () => {
  it('streams the file and reads OK / FOUND replies', async () => {
    const clam = await fakeClamd();
    try {
      expect(await clamdScan(pdf('hello'), '127.0.0.1', clam.port)).toMatchObject({ infected: false });
      expect(await clamdScan(Buffer.from(EICAR), '127.0.0.1', clam.port)).toMatchObject({ infected: true, detail: expect.stringContaining('EICAR') });
      // larger than one 64 KB chunk
      const big = Buffer.concat([pdf(), Buffer.alloc(200_000, 0x41)]);
      expect(await clamdScan(big, '127.0.0.1', clam.port)).toMatchObject({ infected: false });
      expect(clam.requests.at(-1)).toBe(big.length);
    } finally { clam.close(); }
  });

  it('uses it when configured, blocks what it finds, and holds files when it is down', async () => {
    const clam = await fakeClamd();
    useClam(clam.port);
    expect(await scanBuffer(pdf('x'), 'pdf')).toMatchObject({ status: 'CLEAN', engine: 'clamav' });
    clam.close();
    // daemon unreachable: the upload is kept but held, and never served
    useClam(1);
    const held = await saveUpload(file('spec.pdf', pdf('y'), 'application/pdf'));
    expect(held).toMatchObject({ scanStatus: 'ERROR', scanEngine: 'clamav' });
    expect(isServable('ERROR')).toBe(false);
  });

  it('re-scans held and legacy documents once the daemon is back', async () => {
    const svc = await makeService();
    useClam(1);
    const res = await submitRequest(submission(svc.id), { files: [file('spec.pdf', pdf('z'), 'application/pdf')] });
    expect((await db.document.findFirstOrThrow({ where: { requestId: res.id } })).scanStatus).toBe('ERROR');
    const clam = await fakeClamd();
    try {
      useClam(clam.port);
      expect(await rescanHeldDocuments()).toBe(1);
      expect((await db.document.findFirstOrThrow({ where: { requestId: res.id } })).scanStatus).toBe('CLEAN');
    } finally { clam.close(); }
  });

  it('treats an unintelligible reply as a failure, not as clean', async () => {
    const clam = await fakeClamd('garbage');
    try { await expect(clamdScan(pdf(), '127.0.0.1', clam.port)).rejects.toThrow(/Unexpected ClamAV reply/); } finally { clam.close(); }
  });
});
