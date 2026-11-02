import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/session';
import { can } from '@/lib/permissions';
import { saveMedia } from '@/server/media';
import { AppError, safeMessage } from '@/server/errors';
import { env } from '@/server/env';

export const dynamic = 'force-dynamic';

/** Photo upload for the editors (journal, media centre, profile). Signed-in staff with a content permission only, same-site requests only. */
export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(env.APP_URL).origin && !/^https?:\/\/localhost(:\d+)?$/.test(origin)) throw new AppError('FORBIDDEN', 'Request not allowed.');
    const user = await getSessionUser();
    if (!user || !(can(user.role, 'journal.write') || can(user.role, 'media.manage') || can(user.role, 'content.manage'))) throw new AppError('UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new AppError('VALIDATION', 'Choose a photo to upload.');
    const alt = String(form.get('alt') ?? '');
    const d = await saveMedia(user, file, alt);
    return NextResponse.json({ ok: true, key: `media:${d.id}`, url: `/media/${d.id}`, label: `Uploaded: ${d.title ?? alt}` });
  } catch (e) {
    const status = e instanceof AppError ? (e.code === 'UNAUTHENTICATED' ? 401 : e.code === 'FORBIDDEN' ? 403 : 400) : 500;
    return NextResponse.json({ ok: false, error: safeMessage(e) }, { status });
  }
}
