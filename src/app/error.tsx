'use client';

import Link from 'next/link';

/** Last-resort screen for an unexpected failure. No internal detail is shown; the digest lets support find the log line. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="container-x py-24 max-w-3xl">
      <p className="eyebrow mb-4">Something went wrong</p>
      <h1>We could not load this page.</h1>
      <p className="lead mt-6">This is on our side, not yours. Your project list is saved. Try again, or go back to the catalogue.</p>
      {error.digest && <p className="mt-4 text-sm text-steel">Reference: <span className="font-mono">{error.digest}</span></p>}
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={() => reset()}>Try again</button>
        <Link href="/catalogue" className="btn btn-outline">Browse the catalogue</Link>
      </div>
    </main>
  );
}
