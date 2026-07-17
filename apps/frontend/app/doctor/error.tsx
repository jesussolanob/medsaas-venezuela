'use client';

/**
 * Error boundary a nivel de segmento /doctor.
 *
 * Captura CUALQUIER error no manejado dentro del área del doctor SIN reemplazar el
 * shell raíz (a diferencia de global-error.tsx). El layout del doctor (sidebar,
 * sesión) permanece montado → el usuario NO es expulsado a la landing ni pierde la
 * sesión. Ofrece "Reintentar" (reset) e "Ir al inicio" (portal, no landing).
 *
 * Motivación: un Server Action que lanza (p.ej. "Server Action not found" cuando el
 * cliente quedó viejo tras un deploy, ADR-022) o un error de render escalaba hasta el
 * boundary raíz y sacaba al médico de su sesión. Esto nunca debe pasar en producción.
 */
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { RefreshCw, Home } from 'lucide-react';

interface SegmentErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DoctorError({ error, reset }: SegmentErrorProps) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-amber-500"
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
        <h1 className="mb-2 text-lg font-semibold text-slate-800">Algo salió mal</h1>
        <p className="mb-6 text-sm text-slate-500">
          No pudimos completar la acción. Tu sesión sigue activa. Si actualizamos la app hace poco,
          recarga la página. Puedes reintentar o volver al inicio.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-500 px-5 py-2 text-sm font-medium text-white hover:bg-teal-600"
          >
            <RefreshCw className="h-4 w-4" /> Reintentar
          </button>
          <a
            href="/doctor"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Home className="h-4 w-4" /> Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
