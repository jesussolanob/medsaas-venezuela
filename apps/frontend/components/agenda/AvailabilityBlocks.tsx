'use client';

/**
 * components/agenda/AvailabilityBlocks.tsx
 *
 * Gestión de bloqueos de disponibilidad del doctor (Fase 5).
 *
 * Permite:
 *   - Listar bloqueos en un rango de ±90 días.
 *   - Crear un nuevo bloqueo (día completo o rango horario específico).
 *   - Eliminar un bloqueo existente.
 *
 * Comunicación:
 *   GET    /api/doctor/availability-blocks?from=ISO&to=ISO
 *   POST   /api/doctor/availability-blocks
 *   DELETE /api/doctor/availability-blocks/:id
 *
 * Optimista: el ítem se elimina de la UI antes de confirmar el backend.
 * En error se restaura y se muestra toast de error.
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, CalendarX, Loader2, X, AlertCircle, CalendarOff } from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import { reportError } from '@/lib/report-error';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AvailabilityBlock {
  id: string;
  doctor_id: string;
  starts_at: string; // ISO timestamp
  ends_at: string; // ISO timestamp
  reason: string | null;
  created_at: string;
  updated_at: string;
}

type FormMode = 'full_day' | 'range';

interface BlockFormState {
  mode: FormMode;
  date: string; // YYYY-MM-DD (used in full_day mode)
  dateFrom: string; // YYYY-MM-DD (used in range mode)
  timeFrom: string; // HH:MM
  dateTo: string; // YYYY-MM-DD (used in range mode)
  timeTo: string; // HH:MM
  reason: string;
}

const EMPTY_FORM: BlockFormState = {
  mode: 'full_day',
  date: '',
  dateFrom: '',
  timeFrom: '08:00',
  dateTo: '',
  timeTo: '17:00',
  reason: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBlockRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  // Use es-VE locale for display
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Caracas',
  };
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Caracas',
  };

  const startDate = start.toLocaleDateString('es-VE', dateOpts);
  const startTime = start.toLocaleTimeString('es-VE', timeOpts);
  const endDate = end.toLocaleDateString('es-VE', dateOpts);
  const endTime = end.toLocaleTimeString('es-VE', timeOpts);

  // Check if it's a full-day block (00:00 to 23:59 in Caracas)
  const startTZ = new Date(start.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
  const endTZ = new Date(end.toLocaleString('en-US', { timeZone: 'America/Caracas' }));

  const isFullDay =
    startTZ.getHours() === 0 &&
    startTZ.getMinutes() === 0 &&
    endTZ.getHours() === 23 &&
    endTZ.getMinutes() >= 55;

  if (isFullDay) {
    if (startDate === endDate) return `${startDate} — Día completo`;
    return `${startDate} al ${endDate} — Día completo`;
  }

  if (startDate === endDate) {
    return `${startDate} · ${startTime} – ${endTime}`;
  }
  return `${startDate} ${startTime} – ${endDate} ${endTime}`;
}

/** Composes an ISO string for a given date (YYYY-MM-DD) and time (HH:MM) in Caracas TZ */
function toCaracasISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00-04:00`).toISOString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AvailabilityBlocks() {
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<BlockFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load blocks
  // ---------------------------------------------------------------------------

  const loadBlocks = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date();
      from.setDate(from.getDate() - 7); // 1 semana atrás
      const to = new Date();
      to.setDate(to.getDate() + 90); // 90 días adelante

      const qs = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });

      const res = await fetch(`/api/doctor/availability-blocks?${qs.toString()}`);
      if (!res.ok) throw new Error('Error al cargar bloqueos');
      const json = await res.json();
      const data: AvailabilityBlock[] = Array.isArray(json?.data) ? json.data : [];
      // Sort by starts_at ascending
      setBlocks(
        data.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
      );
    } catch (e) {
      reportError('AvailabilityBlocks', 'loadBlocks', e);
      showToast({ type: 'error', message: 'No se pudieron cargar los bloqueos' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBlocks();
  }, [loadBlocks]);

  // ---------------------------------------------------------------------------
  // Validate form
  // ---------------------------------------------------------------------------

  function validateForm(): string | null {
    if (form.mode === 'full_day') {
      if (!form.date) return 'Selecciona una fecha';
    } else {
      if (!form.dateFrom) return 'Selecciona la fecha de inicio';
      if (!form.dateTo) return 'Selecciona la fecha de fin';
      if (form.dateFrom > form.dateTo)
        return 'La fecha de inicio debe ser anterior o igual a la de fin';
      if (form.dateFrom === form.dateTo && form.timeFrom >= form.timeTo) {
        return 'La hora de inicio debe ser anterior a la hora de fin';
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Create block
  // ---------------------------------------------------------------------------

  async function handleCreate() {
    const error = validateForm();
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    setSaving(true);

    try {
      let startsAt: string;
      let endsAt: string;

      if (form.mode === 'full_day') {
        startsAt = toCaracasISO(form.date, '00:00');
        endsAt = toCaracasISO(form.date, '23:59');
      } else {
        startsAt = toCaracasISO(form.dateFrom, form.timeFrom);
        endsAt = toCaracasISO(form.dateTo, form.timeTo);
      }

      const body = {
        starts_at: startsAt,
        ends_at: endsAt,
        reason: form.reason.trim() || undefined,
      };

      const res = await fetch('/api/doctor/availability-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error((json as { error?: string }).error ?? 'Error al guardar');
      }

      const json = await res.json();
      const newBlock = json?.data as AvailabilityBlock | undefined;

      if (newBlock) {
        setBlocks((prev) =>
          [...prev, newBlock].sort(
            (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
          ),
        );
      }

      setForm(EMPTY_FORM);
      setShowForm(false);
      showToast({ type: 'success', message: 'Bloqueo guardado' });
    } catch (e) {
      reportError('AvailabilityBlocks', 'handleCreate', e);
      const msg = e instanceof Error ? e.message : 'Error al guardar';
      showToast({ type: 'error', message: msg });
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Delete block (optimistic)
  // ---------------------------------------------------------------------------

  async function handleDelete(block: AvailabilityBlock) {
    setDeletingId(block.id);

    // Optimistic remove
    setBlocks((prev) => prev.filter((b) => b.id !== block.id));

    try {
      const res = await fetch(`/api/doctor/availability-blocks/${block.id}`, {
        method: 'DELETE',
      });

      if (!res.ok && res.status !== 204) {
        throw new Error('Error al eliminar');
      }

      showToast({ type: 'success', message: 'Bloqueo eliminado' });
    } catch (e) {
      // Restore on error
      reportError('AvailabilityBlocks', 'handleDelete', e);
      setBlocks((prev) =>
        [...prev, block].sort(
          (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
        ),
      );
      showToast({ type: 'error', message: 'No se pudo eliminar el bloqueo' });
    } finally {
      setDeletingId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const inputCls =
    'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors';

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Bloqueos de disponibilidad</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Días u horas en que no atiendes (vacaciones, feriados, compromisos).
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((v) => !v);
            setFormError(null);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 text-white text-xs font-semibold rounded-lg hover:bg-teal-600 transition-colors"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? 'Cancelar' : 'Agregar bloqueo'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            {(['full_day', 'range'] as FormMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setForm((f) => ({ ...f, mode: m }))}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  form.mode === m
                    ? 'bg-teal-500 text-white border-teal-500'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
                }`}
              >
                {m === 'full_day' ? 'Día completo' : 'Rango horario'}
              </button>
            ))}
          </div>

          {/* Full day mode */}
          {form.mode === 'full_day' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Fecha</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className={inputCls}
                min={new Date().toISOString().slice(0, 10)}
              />
            </div>
          )}

          {/* Range mode */}
          {form.mode === 'range' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Fecha inicio
                </label>
                <input
                  type="date"
                  value={form.dateFrom}
                  onChange={(e) => setForm((f) => ({ ...f, dateFrom: e.target.value }))}
                  className={inputCls}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Hora inicio
                </label>
                <input
                  type="time"
                  value={form.timeFrom}
                  onChange={(e) => setForm((f) => ({ ...f, timeFrom: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Fecha fin</label>
                <input
                  type="date"
                  value={form.dateTo}
                  onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value }))}
                  className={inputCls}
                  min={form.dateFrom || new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Hora fin</label>
                <input
                  type="time"
                  value={form.timeTo}
                  onChange={(e) => setForm((f) => ({ ...f, timeTo: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Motivo <span className="text-slate-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              className={inputCls}
              placeholder="Ej. Vacaciones, Feriado, Reunión médica…"
              maxLength={200}
            />
          </div>

          {/* Validation error */}
          {formError && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {formError}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-teal-500 text-white text-sm font-semibold rounded-lg hover:bg-teal-600 disabled:opacity-60 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CalendarX className="w-4 h-4" />
            )}
            {saving ? 'Guardando…' : 'Guardar bloqueo'}
          </button>
        </div>
      )}

      {/* Blocks list */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Cargando bloqueos…</span>
        </div>
      ) : blocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
          <CalendarOff className="w-7 h-7 opacity-40" />
          <p className="text-sm text-slate-500">Sin bloqueos configurados</p>
          <p className="text-xs text-slate-400">
            Agrega bloqueos para los días que no estarás disponible.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {blocks.map((block) => (
            <li
              key={block.id}
              className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-red-200 transition-colors group"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                  <CalendarX className="w-4 h-4 text-red-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {formatBlockRange(block.starts_at, block.ends_at)}
                  </p>
                  {block.reason && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{block.reason}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(block)}
                disabled={deletingId === block.id}
                title="Eliminar bloqueo"
                className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
              >
                {deletingId === block.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
