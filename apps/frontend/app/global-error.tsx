'use client';

/**
 * Global error boundary for the root layout.
 * Sentry captures the error when DSN is configured.
 * Shown only for unexpected crashes that bubble past every other boundary.
 */
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (dsn) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    // global-error replaces the <html> shell — must include html+body.
    <html lang="es">
      <body className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <h1 className="mb-2 text-lg font-semibold text-slate-800">
            Ocurrió un error inesperado
          </h1>
          <p className="mb-6 text-sm text-slate-500">
            El equipo técnico ha sido notificado. Por favor intentá de nuevo.
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-teal-500 px-5 py-2 text-sm font-medium text-white hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          >
            Intentar de nuevo
          </button>
        </div>
      </body>
    </html>
  );
}
