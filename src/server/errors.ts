export class AppError extends Error {
  constructor(
    public code: 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'RATE_LIMITED' | 'UNAUTHENTICATED',
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const forbidden = (m = 'You do not have permission to do that.') => new AppError('FORBIDDEN', m);
export const notFound = (m = 'Not found.') => new AppError('NOT_FOUND', m);
export const conflict = (m: string) => new AppError('CONFLICT', m);
export const invalid = (m: string, fields?: Record<string, string>) => new AppError('VALIDATION', m, fields);

/** Convert any thrown value to a safe message for the UI (no internals leak). */
export function safeMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  console.error('[unexpected]', e);
  return 'Something went wrong on our side. Please try again, or contact us if it persists.';
}
