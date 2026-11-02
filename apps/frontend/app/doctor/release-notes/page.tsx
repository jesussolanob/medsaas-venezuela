'use client';

/**
 * /doctor/release-notes
 *
 * History of all published release notes for the doctor's plan.
 * Also available as the "Novedades" tab in Configuración (/doctor/settings?tab=novedades).
 */

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import ReleaseNotesList from '@/components/release-notes/ReleaseNotesList';

export default function DoctorReleaseNotesPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/doctor"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Novedades de Delta Salud</h1>
            <p className="text-sm text-slate-500">Todas las actualizaciones de la plataforma</p>
          </div>
        </div>

        <ReleaseNotesList />
      </div>
    </div>
  );
}
