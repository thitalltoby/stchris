import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { AppError, safeMessage } from './errors';

export type FormState = { ok?: boolean; message?: string; error?: string; fields?: Record<string, string>; nonce?: number } | null;

/**
 * Wrap a server action body: returns a serialisable state for `useActionState`.
 * Redirects (thrown by `redirect()`) pass through untouched.
 */
export async function runAction(fn: () => Promise<string | void>): Promise<FormState> {
  try {
    const message = await fn();
    return { ok: true, message: message || undefined, nonce: Date.now() };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: safeMessage(e), fields: e instanceof AppError ? (e.fields ?? {}) : {}, nonce: Date.now() };
  }
}

export const str = (fd: FormData, k: string): string => {
  const v = fd.get(k);
  return typeof v === 'string' ? v : '';
};
export const bool = (fd: FormData, k: string): boolean => fd.get(k) === 'on' || fd.get(k) === 'true';
export const files = (fd: FormData, k: string): File[] => fd.getAll(k).filter((f): f is File => f instanceof File && f.size > 0);

/** Only same-site relative paths are accepted as post-login destinations (no open redirect). */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}
