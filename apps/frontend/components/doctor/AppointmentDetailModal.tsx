'use client';

/**
 * AppointmentDetailModal
 *
 * Reutilizable en la agenda y el dashboard. Hace su propio fetch a
 * GET /api/doctor/appointments/:id para obtener el teléfono completo
 * y el detalle sin enmascarar.
 *
 * Acciones incluidas:
 *   - Confirmar cita (si status=scheduled)
 *   - Cancelar cita (confirmación in-modal)
 *   - Reagendar (emite onReschedule — el padre abre su propio UI)
 *   - Ir a consulta (navega a /doctor/consultations?open=<consultationId>)
 *   - Eliminar (confirmación in-modal)
 *
 * Lo que NO muestra:
 *   - appointment_code ("Código cita") — ocultado según especificación agosto 2026
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  CheckCircle,
  Calendar,
  Stethoscope,
  Trash2,
  Loader2,
  AlertCircle,
  Phone,
} from 'lucide-react';
import type { AppointmentDetailData } from '@/app/api/doctor/appointments/[id]/route';
import { showToast } from '@/components/ui/Toaster';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RescheduleRequest = {
  /** Real appointment_id (the appointments table row). */
  id: string;
  patientName: string;
  patientPhone: string | null;
  patientEmail: string | null;
  patientCedula: string | null;
  scheduledAt: string;
  chiefComplaint: string | null;
  planName: string | null;
  planPrice: number | null;
  status: string;
};

type Props = {
  appointmentId: string;
  onClose: () => void;
  /** Called after any mutation so the parent can refresh its list. */
  onChanged?: () => void;
  /** Emitted when the user requests reschedule so the parent can open its UI. */
  onReschedule?: (data: RescheduleRequest) => void;
};

// ---------------------------------------------------------------------------
// Status badge helpers — mirrors the agenda's APPT_STYLE logic
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  completed: 'Atendida',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
  rescheduled: 'Reagendada',
};

const STATUS_BADGE: Record<string, string> = {
  scheduled: 'bg-amber-50 text-amber-700 border border-amber-200',
  confirmed: 'bg-blue-50 text-blue-700 border border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-2 border-red-500',
  no_show: 'bg-slate-100 text-slate-700 border border-slate-300',
  rescheduled: 'bg-violet-50 text-violet-700 border border-violet-200',
};

// ---------------------------------------------------------------------------
// Derived consultation status from appointment status
// ---------------------------------------------------------------------------

function deriveConsultaStatus(
  appt: AppointmentDetailData,
): { label: string; color: string } | null {
  if (!appt.consultationId) return null;
  const terminal = ['completed', 'no_show', 'cancelled'];
  if (terminal.includes(appt.status)) {
    if (appt.status === 'completed')
      return { label: 'Atendida', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (appt.status === 'no_show')
      return { label: 'No asistió', color: 'bg-orange-50 text-orange-700 border-orange-200' };
    if (appt.status === 'cancelled')
      return { label: 'Cancelada', color: 'bg-red-50 text-red-700 border-red-200' };
  }
  return { label: 'Pendiente', color: 'bg-slate-100 text-slate-600 border-slate-200' };
}

// ---------------------------------------------------------------------------
// Sub-component: skeleton while loading
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-5 bg-slate-200 rounded w-2/3" />
      <div className="h-4 bg-slate-200 rounded w-1/2" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-10 bg-slate-100 rounded-xl" />
        <div className="h-10 bg-slate-100 rounded-xl" />
      </div>
      <div className="h-10 bg-slate-100 rounded-xl" />
      <div className="h-8 bg-slate-100 rounded-xl mt-2" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: in-modal confirmation for cancel / delete
// ---------------------------------------------------------------------------

function ConfirmActionModal({
  title,
  description,
  hint,
  confirmLabel,
  confirmClass,
  saving,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  hint?: string;
  confirmLabel: string;
  confirmClass: string;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600">{description}</p>
        {hint && <p className="text-xs text-slate-500 italic">{hint}</p>}
        <div className="flex gap-2 pt-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className={`flex-1 py-2 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60 ${confirmClass}`}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AppointmentDetailModal({
  appointmentId,
  onClose,
  onChanged,
  onReschedule,
}: Props) {
  const router = useRouter();

  const [appt, setAppt] = useState<AppointmentDetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // retryKey is incremented on manual retry to re-run the fetch effect
  const [retryKey, setRetryKey] = useState(0);

  // In-modal sub-flows
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch appointment detail on mount (and on manual retry via retryKey)
  // All setState calls happen inside .then()/.catch() — never synchronously
  // in the effect body — which is required by the react-hooks/set-state-in-effect rule.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/doctor/appointments/${appointmentId}`)
      .then(
        (r) =>
          r.json() as Promise<{ success?: boolean; data?: AppointmentDetailData; error?: string }>,
      )
      .then((json) => {
        if (cancelled) return;
        if (!json.data) {
          setLoadError(json.error ?? 'No se pudo cargar el detalle de la cita.');
        } else {
          setLoadError(null);
          setAppt(json.data);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError('Error de conexión al cargar el detalle.');
      });
    return () => {
      cancelled = true;
    };
  }, [appointmentId, retryKey]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleConfirm() {
    if (!appt) return;
    setConfirming(true);
    try {
      const res = await fetch('/api/doctor/appointment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: appt.id, new_status: 'confirmed' }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({ type: 'error', message: j.error ?? 'Error al confirmar' });
        return;
      }
      setAppt((prev) => (prev ? { ...prev, status: 'confirmed' } : prev));
      showToast({ type: 'success', message: 'Cita confirmada' });
      onChanged?.();
    } catch {
      showToast({ type: 'error', message: 'Error de conexión' });
    } finally {
      setConfirming(false);
    }
  }

  async function handleCancel() {
    if (!appt) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/doctor/appointment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: appt.id, new_status: 'cancelled' }),
      });
      const j = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) {
        if (res.status === 409) {
          // Approved payment — must reschedule instead of cancel.
          // Forward the backend's Spanish message and open reschedule flow.
          setShowCancelConfirm(false);
          const msg =
            j.error ??
            'Esta cita tiene un pago aprobado. Para cancelarla debes reagendarla primero.';
          if (onReschedule) {
            showToast({ type: 'info', message: msg });
            handleReschedule();
          } else {
            showToast({ type: 'error', message: msg });
          }
          return;
        }
        showToast({ type: 'error', message: j.error ?? 'Error al cancelar' });
        return;
      }
      showToast({ type: 'success', message: 'Cita cancelada' });
      onChanged?.();
      onClose();
    } catch {
      showToast({ type: 'error', message: 'Error de conexión' });
    } finally {
      setCancelling(false);
      setShowCancelConfirm(false);
    }
  }

  async function handleDelete() {
    if (!appt) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/doctor/appointments?id=${appt.id}`, { method: 'DELETE' });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({ type: 'error', message: j.error ?? 'Error al eliminar' });
        return;
      }
      showToast({ type: 'success', message: 'Cita eliminada correctamente' });
      onChanged?.();
      onClose();
    } catch {
      showToast({ type: 'error', message: 'Error de conexión' });
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  function handleGoToConsultation() {
    if (!appt) return;
    const consultaId = appt.consultationId;
    if (consultaId) {
      router.push(`/doctor/consultations?open=${consultaId}`);
    } else {
      showToast({ type: 'info', message: 'Confirma la cita para generar su consulta.' });
      router.push('/doctor/consultations');
    }
    onClose();
  }

  function handleReschedule() {
    if (!appt || !onReschedule) return;
    onReschedule({
      id: appt.id,
      patientName: appt.patientName ?? '',
      patientPhone: appt.patientPhone ?? null,
      patientEmail: appt.patientEmail ?? null,
      patientCedula: appt.patientCedula ?? null,
      scheduledAt: appt.scheduledAt,
      chiefComplaint: appt.reason ?? appt.notes ?? null,
      planName: appt.planName ?? null,
      planPrice: appt.planPrice ?? null,
      status: appt.status,
    });
    onClose();
  }

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium' }).format(new Date(iso));

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat('es-VE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Caracas',
    }).format(new Date(iso));

  const fmtEndTime = (iso: string, durationMin: number | null) => {
    if (!durationMin) return null;
    const end = new Date(new Date(iso).getTime() + durationMin * 60_000);
    return new Intl.DateTimeFormat('es-VE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Caracas',
    }).format(end);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const consultaStatus = appt ? deriveConsultaStatus(appt) : null;
  const statusBadge = appt
    ? (STATUS_BADGE[appt.status] ?? 'bg-slate-100 text-slate-700 border border-slate-200')
    : '';
  const statusLabel = appt ? (STATUS_LABELS[appt.status] ?? appt.status) : '';
  const isActive = appt && appt.status !== 'completed' && appt.status !== 'cancelled';
  const endTime = appt ? fmtEndTime(appt.scheduledAt, appt.durationMinutes) : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Detalles de cita</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          {loadError ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm text-slate-600">{loadError}</p>
              <button
                onClick={() => {
                  setAppt(null);
                  setLoadError(null);
                  setRetryKey((k) => k + 1);
                }}
                className="text-xs text-teal-600 hover:underline"
              >
                Reintentar
              </button>
            </div>
          ) : !appt ? (
            <LoadingSkeleton />
          ) : (
            <div className="space-y-3">
              {/* Patient */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">Paciente</p>
                <p className="text-lg font-bold text-slate-900 mt-1">{appt.patientName ?? '—'}</p>
                {appt.patientPhone && (
                  <a
                    href={`tel:${appt.patientPhone}`}
                    className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 mt-0.5"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {appt.patientPhone}
                  </a>
                )}
                {appt.patientCedula && (
                  <p className="text-xs text-slate-500 mt-0.5">{appt.patientCedula}</p>
                )}
              </div>

              {/* Date & time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Fecha</p>
                  <p className="text-sm font-semibold text-slate-700 mt-1">
                    {fmtDate(appt.scheduledAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Horario</p>
                  <p className="text-sm font-semibold text-slate-700 mt-1">
                    {fmtTime(appt.scheduledAt)}
                    {endTime ? ` – ${endTime}` : ''}
                  </p>
                </div>
              </div>

              {/* Consultation code only (appointment_code is intentionally hidden) */}
              {appt.consultationCode && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Código consulta</p>
                  <p className="text-sm font-mono text-teal-600 mt-1">{appt.consultationCode}</p>
                </div>
              )}

              {/* Chief complaint / reason */}
              {(appt.reason ?? appt.notes) && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Motivo</p>
                  <p className="text-sm text-slate-700 mt-1">{appt.reason ?? appt.notes}</p>
                </div>
              )}

              {/* Plan */}
              {appt.planName && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{appt.planName}</span>
                  {appt.planPrice != null && (
                    <span className="text-sm font-bold text-emerald-600">${appt.planPrice}</span>
                  )}
                </div>
              )}

              {/* Office */}
              {appt.officeName && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Consultorio</p>
                  <p className="text-sm text-slate-700 mt-1">{appt.officeName}</p>
                </div>
              )}

              {/* Status badges: cita + consulta */}
              <div className="grid grid-cols-2 gap-2 bg-slate-50 rounded-xl p-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Cita
                  </p>
                  <span
                    className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge}`}
                  >
                    {statusLabel}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Consulta
                  </p>
                  {consultaStatus ? (
                    <span
                      className={`inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${consultaStatus.color}`}
                    >
                      {consultaStatus.label}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-slate-200">
                      Sin consulta
                    </span>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Usa &ldquo;Ir a consulta&rdquo; para ver el detalle completo y gestionar el pago.
              </p>

              {/* Google Meet */}
              {appt.meetLink && (
                <div className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <svg
                        className="w-5 h-5 text-teal-600"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                      </svg>
                      <div>
                        <p className="text-sm font-semibold text-teal-700">Google Meet</p>
                        <p className="text-xs text-teal-500">Videollamada activa</p>
                      </div>
                    </div>
                    <a
                      href={appt.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-teal-500 hover:bg-teal-600 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Abrir Meet
                    </a>
                  </div>
                </div>
              )}

              {/* Appointment actions — shown when the appointment is active OR
                  when Reagendar is available (which is always, per spec). */}
              {(isActive || onReschedule) && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Acciones de la cita
                  </p>

                  {/* Approved-payment notice: Cancel is hidden; explain why. */}
                  {isActive && appt.paymentStatus === 'approved' && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Esta cita tiene un pago aprobado. El pago se mantiene al reagendar — no se
                      emiten créditos ni devoluciones.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {/* Confirmar — only when scheduled */}
                    {appt.status === 'scheduled' && (
                      <button
                        onClick={() => void handleConfirm()}
                        disabled={confirming}
                        className="flex items-center gap-1 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold rounded-lg border border-teal-200 disabled:opacity-50"
                      >
                        {confirming ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5" />
                        )}
                        Confirmar cita
                      </button>
                    )}

                    {/* Cancelar — hidden when payment is approved (must reschedule instead) */}
                    {isActive && appt.paymentStatus !== 'approved' && (
                      <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg border border-red-200"
                      >
                        Cancelar cita
                      </button>
                    )}

                    {/* Reagendar — always available in ALL statuses (completed, no_show, cancelled, etc.) */}
                    {onReschedule && (
                      <button
                        onClick={handleReschedule}
                        className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold rounded-lg border border-amber-200"
                      >
                        <Calendar className="w-3.5 h-3.5" /> Reagendar
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 italic mt-1">
                    El estado de la <strong>consulta</strong> y del <strong>pago</strong> se
                    gestionan en &ldquo;Ir a consulta&rdquo;.
                  </p>
                </div>
              )}

              {/* Footer actions */}
              <div className="flex gap-2 pt-4">
                <button
                  onClick={handleGoToConsultation}
                  className="flex-1 py-2 g-bg rounded-lg text-sm font-bold text-white hover:opacity-90 flex items-center justify-center gap-2"
                >
                  <Stethoscope className="w-4 h-4" />
                  Ir a consulta
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="py-2 px-3 border border-red-200 rounded-lg text-sm font-semibold text-red-500 hover:bg-red-50 flex items-center justify-center gap-1"
                  aria-label="Eliminar cita"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* In-modal: cancel confirmation */}
      {showCancelConfirm && (
        <ConfirmActionModal
          title="Cancelar cita"
          description="Si la cita usaba un paquete prepagado, la sesión se restituirá automáticamente."
          confirmLabel={cancelling ? 'Cancelando...' : 'Cancelar cita'}
          confirmClass="bg-red-500 hover:bg-red-600"
          saving={cancelling}
          onConfirm={() => void handleCancel()}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}

      {/* In-modal: delete confirmation */}
      {showDeleteConfirm && (
        <ConfirmActionModal
          title="Eliminar cita"
          description="Esta acción eliminará la cita permanentemente. Si tiene una consulta vinculada, también se eliminará."
          confirmLabel={deleting ? 'Eliminando...' : 'Eliminar'}
          confirmClass="bg-red-500 hover:bg-red-600"
          saving={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}
