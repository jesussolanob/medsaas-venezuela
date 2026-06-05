'use client';

/**
 * /patient/seguimiento — NEUTRALIZADO (sin Supabase)
 *
 * Vista del módulo "Seguimiento del Paciente" (Shared Health Space).
 *
 * ESTADO ACTUAL: Portal de paciente deshabilitado — salimos sin este portal
 * en Etapa 1. La pantalla muestra un placeholder informativo.
 *
 * DATOS DEFERRED (sin backend endpoint aún):
 *   shared_files table       → falta endpoint GET /api/patient/shared-files
 *   profiles table (doctors) → falta endpoint GET /api/patient/doctors
 *   prescriptions.medications → falta endpoint GET /api/patient/prescriptions
 *   consultation_block_catalog → falta endpoint
 *   doctor_consultation_blocks → falta endpoint
 *   Realtime (postgres_changes)  → falta websocket/SSE backend endpoint
 *   uploadSharedFile / replyWithComment / etc. → lib/shared-files.ts usa stubs;
 *     falta equivalente en backend storage.
 *
 * MIGRADO (Fase 7):
 *   supabase.auth.getUser() + patients table → getPatientProfile() (backend)
 *
 * FASE futura: cuando existan los endpoints de backend listados arriba,
 *   restaurar la carga de datos real y reconectar los handlers.
 */

import { FolderHeart, Clock, Stethoscope } from 'lucide-react';

export default function PatientSeguimientoPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div>
          <h1
            className="font-semibold tracking-tight flex items-center gap-2"
            style={{
              fontFamily: 'var(--dh-font-display)',
              fontSize: 'clamp(22px, 3.2vw, 32px)',
              color: 'var(--dh-ink)',
            }}
          >
            <FolderHeart className="w-6 h-6" style={{ color: 'var(--dh-turquoise)' }} /> Mi
            Seguimiento
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Tareas y archivos compartidos con tus médicos.
          </p>
        </div>
      </div>

      {/* Placeholder — portal de paciente no disponible en esta versión */}
      <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-12 text-center">
        <div className="flex flex-col items-center gap-4 max-w-sm mx-auto">
          <div className="p-4 bg-teal-50 rounded-2xl">
            <Clock className="w-10 h-10 text-teal-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-800 mb-1">
              Módulo en preparación
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              El seguimiento compartido con tu médico estará disponible próximamente. Pronto
              podrás ver tareas, archivos y mensajes en un solo lugar.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <Stethoscope className="w-3.5 h-3.5 shrink-0" />
            <span>Consulta directamente con tu médico mientras tanto.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
