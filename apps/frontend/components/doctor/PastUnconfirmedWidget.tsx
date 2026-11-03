'use client';

/**
 * PastUnconfirmedWidget — "¿La atendiste?"
 *
 * Shows appointments with status=scheduled whose scheduledAt is before today
 * (America/Caracas). Lets the doctor set the final status (Atendida, No asistió,
 * Cancelar) without leaving the dashboard. Click on a row opens the full
 * AppointmentDetailModal via the onOpenDetail callback.
 *
 * Empty list → renders nothing.
 * Shows up to 5 rows; if there are more, a "y N más en la agenda" link appears.
 *
 * Cancellation rule: always offered, but if the backend rejects with 409
 * (payment approved) the error message is surfaced via toast.
 */

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle, XCircle, X, ArrowRight, Loader2 } from 'lucide-react';
import type { PastUnconfirmedAppointment } from '@/app/doctor/dashboard-actions';
import { showToast } from '@/components/ui/Toaster';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionKind = 'completed' | 'no_show' | 'cancelled';

type ActingState = {
  appointmentId: string;
  action: ActionKind;
} | null;

type Props = {
  appointments: PastUnconfirmedAppointment[];
  /** Real number of past unconfirmed appointments (may exceed `appointments.length`). */
  total: number;
  /** Called after any successful status change so the parent re-fetches. */
  onActionDone: () => void;
  /** Opens AppointmentDetailModal for the given appointment id. */
  onOpenDetail: (id: string) => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VISIBLE_LIMIT = 5;

const ACTION_LABELS: Record<ActionKind, string> = {
  completed: 'Atendida',
  no_show: 'No asistió',
  cancelled: 'Cancelar',
};

const SUCCESS_MESSAGES: Record<ActionKind, string> = {
  completed: 'Cita marcada como atendida',
  no_show: 'Paciente marcado como no asistió',
  cancelled: 'Cita cancelada',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtDate = (iso: string): string =>
  new Intl.DateTimeFormat('es-VE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Caracas',
  }).format(new Date(iso));

const fmtTime = (iso: string): string =>
  new Intl.DateTimeFormat('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Caracas',
  }).format(new Date(iso));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PastUnconfirmedWidget({
  appointments,
  total,
  onActionDone,
  onOpenDetail,
}: Props) {
  const [acting, setActing] = useState<ActingState>(null);
  // Optimistic: ids removed from the list after a successful action, before
  // the parent re-fetch completes. Once the parent passes new props (without
  // these ids), the dismissed set becomes irrelevant.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const visible = appointments.filter((a) => !dismissedIds.has(a.id));

  if (visible.length === 0) return null;

  const shown = visible.slice(0, VISIBLE_LIMIT);
  // `total` covers rows beyond the fetched page. Only subtract dismissed rows the
  // current props still contain — after the parent re-fetches, `total` already
  // excludes them.
  const dismissedStillListed = appointments.length - visible.length;
  const pendingCount = Math.max(visible.length, total - dismissedStillListed);
  const hiddenCount = pendingCount - shown.length;

  async function handleAction(appointmentId: string, action: ActionKind): Promise<void> {
    if (acting !== null) return; // prevent concurrent mutations
    setActing({ appointmentId, action });
    try {
      const res = await fetch('/api/doctor/appointment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: appointmentId, new_status: action }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({ type: 'error', message: json.error ?? 'Error al actualizar la cita' });
        return;
      }
      showToast({ type: 'success', message: SUCCESS_MESSAGES[action] });
      // Optimistic dismiss + full refresh from parent.
      setDismissedIds((prev) => new Set([...prev, appointmentId]));
      onActionDone();
    } catch {
      showToast({ type: 'error', message: 'Error de conexión al actualizar la cita' });
    } finally {
      setActing(null);
    }
  }

  return (
    <div
      className="p-4 sm:p-5"
      style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 'var(--dh-r-xl)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#64748b' }} />
        <h2 className="text-sm font-bold" style={{ color: '#334155' }}>
          ¿La atendiste?
        </h2>
        <span
          className="ml-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{
            background: '#e2e8f0',
            color: '#475569',
            fontFamily: 'var(--dh-font-mono)',
          }}
        >
          {pendingCount}
        </span>
        <Link
          href="/doctor/agenda"
          className="ml-auto text-xs font-semibold flex items-center gap-1"
          style={{ color: '#64748b' }}
        >
          Ver agenda
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>
        Citas de días pasados que quedaron sin confirmar. Indica qué pasó para que tus finanzas y
        estadísticas queden al día.
      </p>

      <div className="space-y-2">
        {shown.map((apt) => {
          const isThisActing = acting?.appointmentId === apt.id;
          const anyActing = acting !== null;

          return (
            <div
              key={apt.id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-xl bg-white"
              style={{ border: '1px solid #e2e8f0' }}
            >
              {/* Row: patient info — clicking opens AppointmentDetailModal */}
              <button
                onClick={() => onOpenDetail(apt.id)}
                className="flex-1 min-w-0 text-left"
                aria-label={`Ver detalles de la cita de ${apt.patientName ?? 'paciente'}`}
              >
                <p className="text-sm font-semibold truncate" style={{ color: '#1e293b' }}>
                  {apt.patientName ?? 'Paciente'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                  {fmtDate(apt.scheduledAt)} · {fmtTime(apt.scheduledAt)}
                </p>
              </button>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                {/* Atendida */}
                <button
                  onClick={() => void handleAction(apt.id, 'completed')}
                  disabled={anyActing}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label={`Marcar cita de ${apt.patientName ?? 'paciente'} como atendida`}
                >
                  {isThisActing && acting?.action === 'completed' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  <span>{ACTION_LABELS.completed}</span>
                </button>

                {/* No asistió */}
                <button
                  onClick={() => void handleAction(apt.id, 'no_show')}
                  disabled={anyActing}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold rounded-lg border border-orange-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label={`Marcar cita de ${apt.patientName ?? 'paciente'} como no asistió`}
                >
                  {isThisActing && acting?.action === 'no_show' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  <span>{ACTION_LABELS.no_show}</span>
                </button>

                {/* Cancelar */}
                <button
                  onClick={() => void handleAction(apt.id, 'cancelled')}
                  disabled={anyActing}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-lg border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label={`Cancelar cita de ${apt.patientName ?? 'paciente'}`}
                >
                  {isThisActing && acting?.action === 'cancelled' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                  <span>{ACTION_LABELS.cancelled}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {hiddenCount > 0 && (
        <Link
          href="/doctor/agenda"
          className="mt-3 text-xs font-semibold flex items-center gap-1"
          style={{ color: '#64748b' }}
        >
          y {hiddenCount} más en la agenda
          <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}
