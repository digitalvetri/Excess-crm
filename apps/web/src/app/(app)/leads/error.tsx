'use client';

import { useEffect } from 'react';

export default function LeadsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.error('[leads-error]', error.digest ?? error.message);
    }
  }, [error]);

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <p className="text-sm font-semibold text-red-700">Failed to load leads</p>
      <p className="mt-1 text-xs text-red-500">
        {process.env.NODE_ENV === 'development'
          ? error.message
          : 'An unexpected error occurred. Please try again.'}
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-red-400">Error ID: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
