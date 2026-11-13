import Link from 'next/link';
import { ArrowRight, Megaphone } from 'lucide-react';

/**
 * Home (/doctor) shortcut to the release notes history, which lives as the
 * "Novedades" tab in Configuración. The unseen-notes modal only shows once, so
 * this is the always-visible way back to them.
 */
export default function ReleaseNotesHomeLink() {
  return (
    <Link
      href="/doctor/settings?tab=novedades"
      className="group flex items-center gap-3 bg-white border border-slate-200 px-4 py-3 transition-colors hover:border-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
      style={{ borderRadius: 'var(--dh-r-lg)' }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
        <Megaphone className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800">
          Actualízate con las novedades de la plataforma
        </span>
        <span className="block text-xs text-slate-500">
          Mira las funciones nuevas y las mejoras de Delta Salud
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-600" />
    </Link>
  );
}
