import { NextResponse, after } from 'next/server';
import { submitRequest, confirmationUrl } from '@/server/requests';
import { getSessionUser } from '@/server/session';
import { AppError, safeMessage } from '@/server/errors';
import { kick } from '@/server/handlers';
import { MAX_FILE_BYTES, MAX_FILES_PER_UPLOAD } from '@/server/storage';
import { clearList } from '@/server/project-list';

export const dynamic = 'force-dynamic';

/**
 * Public request submission (multipart: `payload` JSON + `files`). A route handler rather than a server
 * action so the browser can show real upload progress.
 */
export async function POST(req: Request) {
  try {
    const len = Number(req.headers.get('content-length') ?? 0);
    if (len > MAX_FILE_BYTES * MAX_FILES_PER_UPLOAD + 512 * 1024) throw new AppError('VALIDATION', 'The upload is too large. Keep files under 10 MB each.');
    const form = await req.formData();
    let payload: unknown;
    try {
      payload = JSON.parse(String(form.get('payload') ?? '{}'));
    } catch {
      throw new AppError('VALIDATION', 'The request could not be read. Please try again.');
    }
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
    const user = await getSessionUser();
    const portalUser = user && user.role === 'CUSTOMER' ? { id: user.id } : null;
    const repeatOfId = typeof form.get('repeatOfId') === 'string' && portalUser ? String(form.get('repeatOfId')) : null;
    const result = await submitRequest(payload, { files, user: portalUser, source: portalUser ? 'portal' : 'website', repeatOfId });
    // The list has become a request: start the next one fresh
    if (!result.duplicate && Array.isArray((payload as { items?: unknown[] })?.items) && (payload as { items: unknown[] }).items.length > 0) await clearList().catch(() => undefined);
    after(() => kick());
    return NextResponse.json({ ok: true, reference: result.reference, duplicate: result.duplicate, redirect: confirmationUrl(result.reference) });
  } catch (e) {
    if (e instanceof AppError) {
      const status = e.code === 'RATE_LIMITED' ? 429 : e.code === 'FORBIDDEN' ? 403 : 400;
      return NextResponse.json({ ok: false, error: e.message, fields: e.fields ?? {} }, { status });
    }
    return NextResponse.json({ ok: false, error: safeMessage(e), fields: {} }, { status: 500 });
  }
}
