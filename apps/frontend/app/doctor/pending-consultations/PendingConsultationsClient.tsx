'use client';

/**
 * PendingConsultationsClient.tsx
 *
 * Listado interactivo de "consultas por agendar" del especialista.
 * Filtra por estado, muestra badge de vencimiento y expone acciones:
 *   - Agendar → modal con datetime + consultorio + modalidad
 *   - Cancelar → confirmación → PUT /:id/cancel
 */

import { useState, useEffect, useCallback } from 'react';
import {
  CalendarClock,
  CalendarCheck,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  CalendarX,
  RefreshCw,
  Building2,
  Monitor,
  UserCheck,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PendingConsultationStatus =
  | 'pending_scheduling'
  | 'scheduled'
  | 'completed'
  | 'expired'
  | 'cancelled';

interface PendingConsultationItem {
  id: string;
  patient_id: string;
  patient_name: string;
  plan_name: string;
  session_number: number;
  status: PendingConsultationStatus;
  expires_at: string | null;
  office_id: string | null;
  appointment_mode: string | null;
  created_at: string;
}

interface DoctorOffice {
  id: string;
  name: string;
  modality: 'in_person' | 'online' | 'both';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntil(isoDate: string): number {
  const now = Date.now();
  const target = new Date(isoDate).getTime();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Caracas',
  }).format(new Date(isoDate));
}

function formatDateOnly(isoDate: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'medium',
    timeZone: 'America/Caracas',
  }).format(new Date(isoDate));
}

const STATUS_LABELS: Record<PendingConsultationStatus, string> = {
  pending_scheduling: 'Por agendar',
  scheduled: 'Agendada',
  completed: 'Completada',
  expired: 'Vencida',
  cancelled: 'Cancelada',
};

const STATUS_COLORS: Record<PendingConsultationStatus, string> = {
  pending_scheduling: 'bg-amber-50 text-amber-700 border-amber-200',
  scheduled: 'bg-teal-50 text-teal-700 border-teal-200',
  completed: 'bg-slate-100 text-slate-600 border-slate-200',
  expired: 'bg-red-50 text-red-600 border-red-200',
  cancelled: 'bg-slate-100 text-slate-400 border-slate-200',
};

// ---------------------------------------------------------------------------
// Expiry badge
// ---------------------------------------------------------------------------

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
        <Clock className="w-3 h-3" />
        Sin vencimiento
      </span>
    );
  }

  const days = daysUntil(expiresAt);

  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-3 h-3" />
        Vencida
      </span>
    );
  }

  const colorClass =
    days < 3
      ? 'text-red-600 bg-red-50 border-red-200'
      : days < 7
        ? 'text-amber-600 bg-amber-50 border-amber-200'
        : 'text-slate-500 bg-slate-50 border-slate-200';

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium border px-2 py-0.5 rounded-full ${colorClass}`}
    >
      <Clock className="w-3 h-3" />
      Vence en {days}d ({formatDateOnly(expiresAt)})
    </span>
  );
}

// ---------------------------------------------------------------------------
// Schedule modal
// ---------------------------------------------------------------------------

interface ScheduleModalProps {
  item: PendingConsultationItem;
  offices: DoctorOffice[];
  onClose: () => void;
  onSuccess: () => void;
}

function ScheduleModal({ item, offices, onClose, onSuccess }: ScheduleModalProps) {
  const [scheduledAt, setScheduledAt] = useState('');
  const [officeId, setOfficeId] = useState<string>(item.office_id ?? '');
  const [mode, setMode] = useState<'presencial' | 'online'>(
    item.appointment_mode === 'online' ? 'online' : 'presencial',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduledAt) {
      setError('Selecciona una fecha y hora');
      return;
    }

    // Build ISO string from local datetime-local input (Caracas = UTC-4)
    const iso = new Date(`${scheduledAt}:00-04:00`).toISOString();

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/doctor/pending-consultations/${item.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_at: iso,
          office_id: officeId || null,
          appointment_mode: mode,
        }),
      });

      const json = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) {
        if (res.status === 409) {
          setError(json.error ?? 'Este horario ya tiene una cita agendada. Elige otro.');
        } else {
          setError(json.error ?? 'No se pudo agendar la consulta');
        }
        return;
      }

      showToast({ type: 'success', message: 'Consulta agendada correctamente' });
      onSuccess();
      onClose();
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Agendar consulta</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {item.plan_name} · Sesión {item.session_number} · {item.patient_name}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Fecha y hora */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Fecha y hora <span className="text-red-400">*</span>
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-teal-400 bg-white transition-all"
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">Hora en Venezuela (UTC-4)</p>
          </div>

          {/* Consultorio */}
          {offices.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  Consultorio
                </span>
              </label>
              <select
                value={officeId}
                onChange={(e) => setOfficeId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-teal-400 bg-white transition-all"
                aria-label="Seleccionar consultorio"
              >
                <option value="">Sin consultorio específico</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Modalidad */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Modalidad</label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'presencial', label: 'Presencial', Icon: Building2 },
                  { value: 'online', label: 'Online', Icon: Monitor },
                ] as const
              ).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    mode === value
                      ? 'border-teal-400 bg-teal-50 text-teal-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !scheduledAt}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CalendarCheck className="w-4 h-4" />
              )}
              Agendar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const STATUS_FILTER_OPTIONS: { value: PendingConsultationStatus | 'all'; label: string }[] = [
  { value: 'pending_scheduling', label: 'Por agendar' },
  { value: 'scheduled', label: 'Agendadas' },
  { value: 'expired', label: 'Vencidas' },
  { value: 'cancelled', label: 'Canceladas' },
];

export default function PendingConsultationsClient() {
  const [items, setItems] = useState<PendingConsultationItem[]>([]);
  const [offices, setOffices] = useState<DoctorOffice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<PendingConsultationStatus | 'all'>(
    'pending_scheduling',
  );
  const [schedulingItem, setSchedulingItem] = useState<PendingConsultationItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PendingConsultationItem | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchItems = useCallback(async (status: PendingConsultationStatus | 'all') => {
    setLoading(true);
    try {
      const qs = status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`/api/doctor/pending-consultations${qs}`, { cache: 'no-store' });
      if (!res.ok) {
        setItems([]);
        return;
      }
      const json = (await res.json()) as { data?: PendingConsultationItem[] };
      setItems(Array.isArray(json.data) ? json.data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOffices = useCallback(async () => {
    try {
      const res = await fetch('/api/doctor/offices', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as { data?: DoctorOffice[] };
      if (Array.isArray(json.data)) setOffices(json.data);
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    void fetchItems(statusFilter);
  }, [statusFilter, fetchItems]);

  useEffect(() => {
    void fetchOffices();
  }, [fetchOffices]);

  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/doctor/pending-consultations/${cancelTarget.id}/cancel`, {
        method: 'PUT',
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({ type: 'error', message: json.error ?? 'No se pudo cancelar la consulta' });
        return;
      }
      showToast({ type: 'success', message: 'Consulta cancelada' });
      void fetchItems(statusFilter);
    } catch {
      showToast({ type: 'error', message: 'Error de conexión. Intenta de nuevo.' });
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Modals */}
      {schedulingItem && (
        <ScheduleModal
          item={schedulingItem}
          offices={offices}
          onClose={() => setSchedulingItem(null)}
          onSuccess={() => void fetchItems(statusFilter)}
        />
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancelar consulta"
        message={
          cancelTarget
            ? `¿Cancelar la sesión ${cancelTarget.session_number} de "${cancelTarget.plan_name}" para ${cancelTarget.patient_name}? Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel={cancelling ? 'Cancelando...' : 'Cancelar consulta'}
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1
            className="font-semibold tracking-tight"
            style={{
              fontFamily: 'var(--dh-font-display)',
              fontSize: 'clamp(22px, 3.2vw, 32px)',
              color: 'var(--dh-ink)',
            }}
          >
            Consultas por agendar
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--dh-gray-600)' }}>
            Sesiones diferidas de paquetes que el paciente aún no ha agendado
          </p>
        </div>
        <button
          onClick={() => void fetchItems(statusFilter)}
          disabled={loading}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          aria-label="Actualizar lista"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value as PendingConsultationStatus | 'all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              statusFilter === opt.value
                ? 'bg-teal-500 text-white border-teal-500 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <CalendarClock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">
            No hay consultas con estado &quot;
            {STATUS_LABELS[statusFilter as PendingConsultationStatus] ?? 'Por agendar'}&quot;
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Las sesiones diferidas de paquetes multi-sesión aparecerán aquí
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => (
            <ConsultationCard
              key={item.id}
              item={item}
              onSchedule={() => setSchedulingItem(item)}
              onCancel={() => setCancelTarget(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card sub-component
// ---------------------------------------------------------------------------

interface ConsultationCardProps {
  item: PendingConsultationItem;
  onSchedule: () => void;
  onCancel: () => void;
}

function ConsultationCard({ item, onSchedule, onCancel }: ConsultationCardProps) {
  const isPendingScheduling = item.status === 'pending_scheduling';
  const isScheduled = item.status === 'scheduled';

  return (
    <div
      className={`bg-white border rounded-xl p-5 transition-all ${
        isPendingScheduling
          ? 'border-slate-200 hover:border-teal-200 hover:shadow-sm'
          : 'border-slate-100 opacity-80'
      }`}
    >
      {/* Top row: patient + status */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'var(--dh-turquoise-50)' }}
          >
            <UserCheck className="w-4 h-4" style={{ color: 'var(--dh-turquoise-700)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{item.patient_name}</p>
            <p className="text-[11px] text-slate-400">Sesión {item.session_number}</p>
          </div>
        </div>
        <span
          className={`shrink-0 text-[10px] font-bold uppercase border px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status]}`}
        >
          {STATUS_LABELS[item.status]}
        </span>
      </div>

      {/* Plan name */}
      <p className="text-sm font-medium text-slate-700 mb-2">{item.plan_name}</p>

      {/* Expiry badge */}
      <div className="mb-4">
        <ExpiryBadge expiresAt={item.expires_at} />
      </div>

      {/* Creation date */}
      <p className="text-[11px] text-slate-400 mb-4">Creada el {formatDate(item.created_at)}</p>

      {/* Actions */}
      {isPendingScheduling && (
        <div className="flex gap-2 pt-3 border-t border-slate-100">
          <button
            onClick={onSchedule}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold transition-colors"
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            Agendar
          </button>
          <button
            onClick={onCancel}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50 text-xs font-medium transition-colors"
            aria-label="Cancelar esta consulta por agendar"
          >
            <CalendarX className="w-3.5 h-3.5" />
            Cancelar
          </button>
        </div>
      )}

      {isScheduled && (
        <div className="pt-3 border-t border-slate-100">
          <p className="text-[11px] text-teal-600 font-medium flex items-center gap-1.5">
            <CalendarCheck className="w-3.5 h-3.5" />
            Ya tiene cita agendada
          </p>
        </div>
      )}
    </div>
  );
}
