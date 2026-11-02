export class RedirectError extends Error { constructor(public url: string) { super(`REDIRECT:${url}`); } }
export function redirect(url: string): never { throw new RedirectError(url); }
export function notFound(): never { throw new Error('NOT_FOUND'); }
export function unstable_rethrow(e: unknown): void { if (e instanceof RedirectError) throw e; }
