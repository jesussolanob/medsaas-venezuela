'use client';

/**
 * RescheduleFlow.tsx
 *
 * Client component that handles the patient reschedule flow when
 * `/book/[doctorId]?reagendar=<token>` is opened.
 *
 * Steps:
 *  1. Date + time picker (uses same slot-generation logic as BookingClient)
 *  2. Confirm step  — "Mover mi cita al {fecha} a las {hora}"
 *  3. Success screen — "¡Listo! Tu cita quedó para el {fecha} a las {hora}."
 *
 * On 409 the slot is marked as taken, the picker refreshes and shows the error
 * inline so the patient can pick a different time without reloading the page.
 */

import { useState, useEffect } from 'react';
import { Calendar, CheckCircle, ChevronLeft, ChevronRight, AlertCircle, Clock } from 'lucide-react';
import type { AppointmentRescheduleInfo } from '@/app/api/public/appointments/reschedule/[token]/route';

// ── Types ─────────────────────────────────────────────────────────────────────

type OfficeModality = 'in_person' | 'online' | 'both';

type DoctorOffice = {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  schedule: { day: number; enabled: boolean; start: string; end: string }[];
  slot_duration: number;
  buffer_minutes: number;
  modality: OfficeModality;
};

type Slot = { date: string; time: string; label: string };

type Step = 'date' | 'confirm' | 'success';

export interface RescheduleFlowProps {
  token: string;
  info: AppointmentRescheduleInfo;
  doctorId: string;
  offices: DoctorOffice[];
}

// ── Slot generation helpers (derived from BookingClient) ──────────────────────
// These are intentionally co-located here to keep RescheduleFlow self-contained.

const GENERIC_TIMES: string[] = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
];

function timesBetween(start: string, end: string, slotMin: number, bufferMin: number): string[] {
  const out: string[] = [];
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (isNaN(sh) || isNaN(eh)) return [];
  const startTotal = sh * 60 + (sm || 0);
  const endTotal = eh * 60 + (em || 0);
  const step = Math.max(15, (slotMin || 30) + (bufferMin || 0));
  for (let t = startTotal; t + (slotMin || 30) <= endTotal; t += step) {
    const h = String(Math.floor(t / 60)).padStart(2, '0');
    const m = String(t % 60).padStart(2, '0');
    out.push(`${h}:${m}`);
  }
  return out;
}

/**
 * Genera slots disponibles para los próximos `horizonDays` días.
 * RONDA 28: dateStr usa hora local para evitar el desfase de un día UTC.
 */
function generateSlots(offices: DoctorOffice[] = [], horizonDays = 56): Slot[] {
  const slots: Slot[] = [];
  const today = new Date();
  const hasOffices = offices.length > 0;

  for (let d = 1; d <= horizonDays; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    const jsDay = date.getDay(); // 0=dom … 6=sab
    const scheduleDay = jsDay === 0 ? 6 : jsDay - 1; // BD: 0=lun … 6=dom

    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const dayLabel = date.toLocaleDateString('es-VE', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });

    if (hasOffices) {
      const enabledOffices = offices.filter((o) =>
        o.schedule?.some((s) => s.day === scheduleDay && s.enabled),
      );
      if (enabledOffices.length === 0) continue;

      const dayTimes = new Set<string>();
      for (const off of enabledOffices) {
        const scheds = off.schedule!.filter((s) => s.day === scheduleDay && s.enabled);
        for (const sched of scheds) {
          timesBetween(
            sched.start,
            sched.end,
            off.slot_duration ?? 30,
            off.buffer_minutes ?? 0,
          ).forEach((t) => dayTimes.add(t));
        }
      }
      Array.from(dayTimes)
        .sort()
        .forEach((t) => slots.push({ date: dateStr, time: t, label: dayLabel }));
    } else {
      GENERIC_TIMES.forEach((t) => slots.push({ date: dateStr, time: t, label: dayLabel }));
    }
  }
  return slots;
}

function groupByDate(slots: Slot[]): Record<string, Slot[]> {
  const map: Record<string, Slot[]> = {};
  slots.forEach((s) => {
    if (!map[s.date]) map[s.date] = [];
    map[s.date].push(s);
  });
  return map;
}

// ── Component ─────────────────────────────────────────────────────────────────

/** "2026-11-24" → "24 nov." (noon avoids timezone shifts). */
function formatShortDay(ymd: string | undefined): string {
  if (!ymd) return '';
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'short',
  });
}

export default function RescheduleFlow({ token, info, doctorId, offices }: RescheduleFlowProps) {
  const [step, setStep] = useState<Step>('date');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [unavailableTimes, setUnavailableTimes] = useState<Map<string, Set<string>>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState<AppointmentRescheduleInfo | null>(null);

  // Prefer the same office as the original appointment; fall back to all.
  const matchingOffices = info.officeName
    ? offices.filter((o) => o.name === info.officeName)
    : offices;
  const officesForSlots = matchingOffices.length > 0 ? matchingOffices : offices;

  const allSlots = generateSlots(officesForSlots, 56);
  const grouped = groupByDate(allSlots);
  const dates = Object.keys(grouped).sort();
  const maxWeekOffset = Math.max(0, Math.ceil(dates.length / 5) - 1);
  const weekDates = dates.slice(weekOffset * 5, weekOffset * 5 + 5);

  // Lazy-load slot availability from the backend for the selected date.
  useEffect(() => {
    if (!selectedDate || unavailableTimes.has(selectedDate)) return;

    const fetchSlots = async () => {
      try {
        const res = await fetch(`/api/booking/${doctorId}/slots?date=${selectedDate}`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          slots?: { time: string; available: boolean }[];
        };
        const notAvailable = new Set<string>();
        for (const s of json.slots ?? []) {
          if (s.available === false && s.time) {
            notAvailable.add(s.time.slice(0, 5));
          }
        }
        setUnavailableTimes((prev) => new Map(prev).set(selectedDate, notAvailable));
      } catch {
        // Degrade silently: all slots appear available, backend rejects if taken.
      }
    };
    void fetchSlots();
  }, [selectedDate, doctorId, unavailableTimes]);

  const isSlotUnavailable = (date: string, time: string): boolean =>
    unavailableTimes.get(date)?.has(time) ?? false;

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedTime('');
    setError('');
  };

  const handleSelectTime = (time: string) => {
    setSelectedTime(time);
    setError('');
  };

  const handleProceedToConfirm = () => {
    if (!selectedDate || !selectedTime) {
      setError('Selecciona una fecha y hora para continuar.');
      return;
    }
    setStep('confirm');
    setError('');
  };

  const handleSubmit = async () => {
    if (!selectedDate || !selectedTime) return;
    setSubmitting(true);
    setError('');

    // Build ISO8601 anchored to Caracas offset (-04:00)
    const scheduledAt = `${selectedDate}T${selectedTime}:00-04:00`;

    try {
      const res = await fetch(`/api/public/appointments/reschedule/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt }),
      });

      if (res.status === 409) {
        // Slot is now taken — refresh availability and let patient pick again.
        setUnavailableTimes((prev) => {
          const next = new Map(prev);
          next.delete(selectedDate); // force re-fetch on next render
          return next;
        });
        setSelectedTime('');
        setStep('date');
        setError('Ese horario ya no está disponible. Elige otro.');
        return;
      }

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? 'No se pudo reagendar la cita. Intenta de nuevo.');
        return;
      }

      const json = (await res.json()) as { data?: AppointmentRescheduleInfo };
      setSuccessInfo(json.data ?? info);
      setStep('success');
    } catch {
      setError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success Screen ───────────────────────────────────────────────────────

  if (step === 'success') {
    const si = successInfo!;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 max-w-sm w-full p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-8 h-8 text-emerald-500" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">¡Listo!</h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            Tu cita quedó para el <span className="font-semibold text-slate-800">{si.date}</span> a
            las <span className="font-semibold text-slate-800">{si.time}</span>
            {/* "a. m." already ends in a period: avoid "a. m.." */}
            {si.time.endsWith('.') ? '' : '.'}
          </p>
          <p className="text-xs text-slate-400 mt-5">
            {si.doctorName} recibirá la notificación de tu cambio.
          </p>
        </div>
      </div>
    );
  }

  // ── Shared layout ────────────────────────────────────────────────────────

  const selectedDateLabel =
    selectedDate && grouped[selectedDate] ? (grouped[selectedDate][0]?.label ?? selectedDate) : '';
  const timesForDate = selectedDate ? (grouped[selectedDate] ?? []).map((s) => s.time) : [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-lg">
        {/* Page header */}
        <header className="mb-6 text-center">
          <span
            className="inline-block px-3 py-1 rounded-full text-xs font-semibold text-white mb-3"
            style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #0891b2 100%)' }}
          >
            Reagendar cita
          </span>
          <h1 className="text-xl font-bold text-slate-800">Nueva fecha con {info.doctorName}</h1>
        </header>

        {/* Current-appointment info banner */}
        <div
          role="note"
          aria-label="Cita que estás reagendando"
          className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 flex items-start gap-3"
        >
          <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-amber-800">
            Estás reagendando tu cita del <span className="font-semibold">{info.date}</span> a las{' '}
            <span className="font-semibold">{info.time}</span> con {info.doctorName}.
          </p>
        </div>

        {/* ── Step: date + time picker ─────────────────────────────────── */}
        {step === 'date' && (
          <section
            aria-labelledby="reschedule-date-heading"
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
          >
            <h2
              id="reschedule-date-heading"
              className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2"
            >
              <Calendar className="w-4 h-4 text-cyan-500" aria-hidden="true" />
              Elige la nueva fecha
            </h2>

            {/* Week navigation */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setWeekOffset((p) => Math.max(0, p - 1))}
                disabled={weekOffset === 0}
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-colors"
                aria-label="Ver semana anterior"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" aria-hidden="true" />
              </button>
              <span className="text-xs text-slate-500 font-medium" aria-live="polite">
                {weekDates.length > 0
                  ? `${formatShortDay(weekDates[0])} – ${formatShortDay(weekDates[weekDates.length - 1])}`
                  : 'Sin fechas disponibles'}
              </span>
              <button
                type="button"
                onClick={() => setWeekOffset((p) => Math.min(maxWeekOffset, p + 1))}
                disabled={weekOffset >= maxWeekOffset}
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-colors"
                aria-label="Ver semana siguiente"
              >
                <ChevronRight className="w-4 h-4 text-slate-600" aria-hidden="true" />
              </button>
            </div>

            {/* Date pills */}
            <div
              role="listbox"
              aria-label="Fechas disponibles"
              className="grid grid-cols-5 gap-1.5 mb-5"
            >
              {weekDates.map((date) => {
                const slots = grouped[date] ?? [];
                const hasAvailable = slots.some((s) => !isSlotUnavailable(date, s.time));
                const isSelected = selectedDate === date;
                return (
                  <button
                    key={date}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => hasAvailable && handleSelectDate(date)}
                    disabled={!hasAvailable}
                    className={[
                      'rounded-xl py-2.5 text-center transition-all text-xs font-medium border',
                      isSelected
                        ? 'bg-cyan-500 text-white border-cyan-500 shadow-sm'
                        : hasAvailable
                          ? 'border-slate-200 text-slate-700 hover:border-cyan-300 hover:bg-cyan-50 cursor-pointer'
                          : 'border-slate-100 text-slate-300 cursor-not-allowed',
                    ].join(' ')}
                  >
                    <span className="block capitalize">
                      {new Date(`${date}T12:00:00`).toLocaleDateString('es-VE', {
                        weekday: 'short',
                      })}
                    </span>
                    <span className="block text-[11px] font-semibold mt-0.5">
                      {new Date(`${date}T12:00:00`).getDate()}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Time slots */}
            {selectedDate && timesForDate.length > 0 && (
              <>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Horarios disponibles —{' '}
                  <span className="normal-case font-normal">{selectedDateLabel}</span>
                </p>
                <div
                  role="listbox"
                  aria-label="Horarios disponibles"
                  className="grid grid-cols-4 gap-1.5 mb-4"
                >
                  {timesForDate.map((time) => {
                    const unavailable = isSlotUnavailable(selectedDate, time);
                    const isSelected = selectedTime === time;
                    return (
                      <button
                        key={time}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => !unavailable && handleSelectTime(time)}
                        disabled={unavailable}
                        className={[
                          'rounded-lg py-2 text-xs font-medium border transition-all',
                          isSelected
                            ? 'bg-cyan-500 text-white border-cyan-500'
                            : unavailable
                              ? 'border-slate-100 text-slate-300 cursor-not-allowed line-through'
                              : 'border-slate-200 text-slate-700 hover:border-cyan-300 hover:bg-cyan-50 cursor-pointer',
                        ].join(' ')}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {error && (
              <div
                role="alert"
                className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleProceedToConfirm}
              disabled={!selectedDate || !selectedTime}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continuar
            </button>
          </section>
        )}

        {/* ── Step: confirm ────────────────────────────────────────────── */}
        {step === 'confirm' && (
          <section
            aria-labelledby="reschedule-confirm-heading"
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
          >
            <h2 id="reschedule-confirm-heading" className="text-base font-bold text-slate-800 mb-4">
              Confirmar cambio de fecha
            </h2>

            <dl className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-5 space-y-2.5">
              <div className="flex justify-between text-sm">
                <dt className="text-slate-500">Especialista</dt>
                <dd className="font-semibold text-slate-800">{info.doctorName}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-slate-500">Nueva fecha</dt>
                <dd className="font-semibold text-slate-800 capitalize">{selectedDateLabel}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-slate-500">Nueva hora</dt>
                <dd className="font-semibold text-slate-800">{selectedTime}</dd>
              </div>
              {info.officeName && (
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Consultorio</dt>
                  <dd className="font-semibold text-slate-800">{info.officeName}</dd>
                </div>
              )}
            </dl>

            {error && (
              <div
                role="alert"
                className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setStep('date');
                  setError('');
                }}
                className="flex-1 py-3 rounded-xl font-semibold text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl font-semibold text-sm bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-40 transition-all"
              >
                {submitting
                  ? 'Moviendo cita…'
                  : `Mover mi cita al ${selectedDate ? formatShortDay(selectedDate) : ''} a las ${selectedTime}`}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
