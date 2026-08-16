'use client';

/**
 * RescheduleModal — self-contained reschedule flow.
 *
 * Fetches the doctor's schedule config from /api/doctor/schedule and
 * checks booked slots per day via GET /api/doctor/appointments?date=YYYY-MM-DD.
 * Calls POST /api/doctor/reschedule on confirm.
 *
 * Used by the dashboard (/doctor/page.tsx) and the consultation detail
 * (ConsultationsClient.tsx) where schedule config is not available in scope.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toLocalYMD, toLocalHHMM } from '@/lib/timezone';
import { showToast } from '@/components/ui/Toaster';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleConfig {
  slot_duration: number;
  buffer_minutes: number;
}

interface AvailabilitySlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_enabled: boolean;
}

export interface RescheduleModalProps {
  appointmentId: string;
  patientName: string;
  /** ISO string or YYYY-MM-DD displayed as current appointment date. */
  currentScheduledAt: string;
  /**
   * Optional message in Spanish shown to the user — used when reschedule was
   * triggered by a payment conflict (no credit/refund, payment follows the new date).
   */
  infoMessage?: string;
  onClose: () => void;
  onSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Time utilities (same logic as agenda/page.tsx)
// ---------------------------------------------------------------------------

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function generateTimeSlots(
  dayOfWeek: number,
  availSlots: AvailabilitySlot[],
  config: ScheduleConfig,
): { time: string; endTime: string }[] {
  const daySlots = availSlots.filter((s) => s.day_of_week === dayOfWeek && s.is_enabled);
  const result: { time: string; endTime: string }[] = [];
  for (const slot of daySlots) {
    const blockStart = timeToMinutes(slot.start_time);
    const blockEnd = timeToMinutes(slot.end_time);
    const step = config.slot_duration + config.buffer_minutes;
    let current = blockStart;
    while (current + config.slot_duration <= blockEnd) {
      const startStr = `${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`;
      result.push({ time: startStr, endTime: addMinutes(startStr, config.slot_duration) });
      current += step;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RescheduleModal({
  appointmentId,
  patientName,
  currentScheduledAt,
  infoMessage,
  onClose,
  onSuccess,
}: RescheduleModalProps) {
  const [config, setConfig] = useState<ScheduleConfig | null>(null);
  const [availSlots, setAvailSlots] = useState<AvailabilitySlot[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [bookedTimes, setBookedTimes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Fetch schedule config on mount.
  // All setState calls are inside .then()/.catch(), not in the effect body,
  // satisfying the react-hooks/set-state-in-effect rule.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/doctor/schedule')
      .then((r) => r.json() as Promise<{ config?: ScheduleConfig; slots?: AvailabilitySlot[] }>)
      .then((data) => {
        if (cancelled) return;
        setConfig(data.config ?? { slot_duration: 30, buffer_minutes: 0 });
        setAvailSlots(data.slots ?? []);
      })
      .catch(() => {
        if (!cancelled) setLoadError('No se pudo cargar el horario del especialista.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch booked times when date changes.
  // All setState calls live inside .then()/.catch() callbacks — never in the
  // synchronous effect body — to satisfy the react-hooks/set-state-in-effect rule.
  useEffect(() => {
    let cancelled = false;
    const doFetch = (date: string) =>
      fetch(`/api/doctor/appointments?date=${date}`)
        .then((r) => r.json() as Promise<{ bookedAt?: string[] }>)
        .then((data) => {
          if (cancelled) return;
          // Convert ISO timestamps to HH:MM (Caracas timezone) for slot comparison
          const times = (data.bookedAt ?? []).map((iso) => toLocalHHMM(new Date(iso)));
          setBookedTimes(times);
        })
        .catch(() => {
          // Non-fatal: treat all slots as available on fetch error
          if (!cancelled) setBookedTimes([]);
        });

    if (rescheduleDate) {
      void doFetch(rescheduleDate);
    } else {
      // Use a resolved promise so the setState is always inside an async callback
      Promise.resolve().then(() => {
        if (!cancelled) setBookedTimes([]);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [rescheduleDate]);

  // Ventana móvil de 21 días hábiles empezando HOY.
  // Antes arrancaba mañana, lo que dejaba afuera el caso más común de una
  // inasistencia: el paciente falta a las 9 y vuelve esa misma tarde.
  const dates: string[] = [];
  const today = new Date();
  for (let d = 0; d <= 35 && dates.length < 21; d++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() + d);
    if (dt.getDay() === 0) continue; // skip Sundays
    dates.push(toLocalYMD(dt));
  }
  const weekDates = dates.slice(weekOffset * 5, weekOffset * 5 + 5);

  const isSlotBooked = useCallback(
    (time: string): boolean => bookedTimes.includes(time),
    [bookedTimes],
  );

  const getSlots = useCallback(
    (date: string): { time: string; endTime: string }[] => {
      if (!config) return [];
      const d = new Date(date + 'T12:00:00');
      // Mirror the agenda convention: (d.getDay() + 6) % 7 → 0=Mon, 6=Sun
      const dayOfWeek = (d.getDay() + 6) % 7;
      return generateTimeSlots(dayOfWeek, availSlots, config);
    },
    [config, availSlots],
  );

  async function handleConfirm() {
    if (!rescheduleDate || !rescheduleTime || saving) return;
    setSaving(true);
    try {
      // Use explicit Caracas offset (-04:00) — no DST in Venezuela since 2016
      const newDate = `${rescheduleDate}T${rescheduleTime}:00-04:00`;
      const res = await fetch('/api/doctor/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, newDate }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({ type: 'error', message: j.error ?? 'Error al reagendar' });
        return;
      }
      showToast({ type: 'success', message: 'Cita reagendada correctamente' });
      onSuccess();
      onClose();
    } catch {
      showToast({ type: 'error', message: 'Error de conexión al reagendar' });
    } finally {
      setSaving(false);
    }
  }

  const slots = rescheduleDate ? getSlots(rescheduleDate) : [];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Reagendar cita</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Optional info banner — e.g. when triggered by approved-payment conflict */}
        {infoMessage && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            {infoMessage}
          </div>
        )}

        {/* Patient summary */}
        <div className="bg-slate-50 rounded-lg p-4 space-y-1">
          <p className="text-sm text-slate-600">
            <span className="font-semibold">Paciente:</span> {patientName}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-semibold">Cita actual:</span>{' '}
            {new Date(currentScheduledAt).toLocaleDateString('es-VE', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>

        {loadError ? (
          <p className="text-sm text-red-500 text-center py-4">{loadError}</p>
        ) : !config ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
          </div>
        ) : (
          <>
            {/* Date picker */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Selecciona la nueva fecha
              </p>

              {/* Week navigation */}
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <button
                  onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
                  disabled={weekOffset === 0}
                  className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center disabled:opacity-30"
                  aria-label="Semana anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
                </button>
                <span className="text-xs font-semibold text-slate-600">
                  {weekDates.length > 0
                    ? new Date(weekDates[0] + 'T12:00:00').toLocaleDateString('es-VE', {
                        day: 'numeric',
                        month: 'short',
                      }) +
                      ' — ' +
                      new Date(weekDates[weekDates.length - 1] + 'T12:00:00').toLocaleDateString(
                        'es-VE',
                        { day: 'numeric', month: 'short' },
                      )
                    : ''}
                </span>
                <button
                  onClick={() => setWeekOffset(weekOffset + 1)}
                  disabled={(weekOffset + 1) * 5 >= dates.length}
                  className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center disabled:opacity-30"
                  aria-label="Semana siguiente"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>

              {/* Date cards */}
              <div className="grid grid-cols-5 gap-2">
                {weekDates.map((date) => {
                  const d = new Date(date + 'T12:00:00');
                  const dayName = d.toLocaleDateString('es-VE', { weekday: 'short' });
                  const dayNum = d.getDate();
                  const monthName = d.toLocaleDateString('es-VE', { month: 'short' });
                  const isSel = rescheduleDate === date;
                  const daySlots = getSlots(date);
                  const hasSlots = daySlots.length > 0;
                  return (
                    <button
                      key={date}
                      onClick={() => {
                        setRescheduleDate(date);
                        setRescheduleTime(null);
                      }}
                      disabled={!hasSlots}
                      className={`rounded-xl p-2.5 text-center transition-all ${
                        isSel
                          ? 'bg-teal-500 text-white shadow-md'
                          : !hasSlots
                            ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                            : 'bg-white border border-slate-200 hover:border-teal-300 text-slate-700'
                      }`}
                    >
                      <p
                        className={`text-[10px] font-semibold uppercase ${isSel ? 'text-white/80' : 'text-slate-400'}`}
                      >
                        {dayName}
                      </p>
                      <p className={`text-lg font-bold ${isSel ? 'text-white' : ''}`}>{dayNum}</p>
                      <p className={`text-[10px] ${isSel ? 'text-white/70' : 'text-slate-400'}`}>
                        {monthName}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time slots for selected date */}
            {rescheduleDate && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Horarios disponibles —{' '}
                  {new Date(rescheduleDate + 'T12:00:00').toLocaleDateString('es-VE', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
                {slots.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">
                    No hay horarios configurados para este día
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {slots.map((slot) => {
                      const booked = isSlotBooked(slot.time);
                      const isSel = rescheduleTime === slot.time;
                      return (
                        <button
                          key={slot.time}
                          onClick={() => {
                            if (!booked) setRescheduleTime(slot.time);
                          }}
                          disabled={booked}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                            booked
                              ? 'bg-slate-100 text-slate-300 cursor-not-allowed line-through'
                              : isSel
                                ? 'bg-teal-500 text-white shadow-md'
                                : 'bg-white border border-slate-200 text-slate-700 hover:border-teal-400 hover:text-teal-600'
                          }`}
                        >
                          {slot.time}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Selection summary */}
            {rescheduleDate && rescheduleTime && (
              <div className="bg-emerald-50 rounded-lg p-3 text-sm text-emerald-700">
                <span className="font-semibold">Nueva cita:</span>{' '}
                {new Date(rescheduleDate + 'T12:00:00').toLocaleDateString('es-VE', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}{' '}
                a las {rescheduleTime}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={!rescheduleDate || !rescheduleTime || saving}
            className="flex-1 py-2 bg-teal-500 text-white rounded-lg text-sm font-semibold hover:bg-teal-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
