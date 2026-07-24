'use client';

/**
 * /agendar/[token]
 *
 * Página pública — sin auth, sin sidebar.
 * El paciente llega aquí desde el link del email de consulta pendiente.
 *
 * Flujo:
 *   1. Al montar: GET /api/public/pending-consultations/:token  → info del token
 *   2. Si is_schedulable=false → estado informativo (expirado, ya agendado, etc.)
 *   3. Si is_schedulable=true → cargar consultorios del doctor y mostrar selector de slots
 *   4. Paciente elige fecha/hora → POST /api/public/pending-consultations/:token/schedule
 *   5. Éxito → pantalla de confirmación
 */

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle,
  Calendar,
  Clock,
  MapPin,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
} from 'lucide-react';
import { DeltaMark } from '@/components/dh';

// ── Brand tokens ──────────────────────────────────────────────────────────────
const BRAND = {
  turquoise: '#06B6D4',
  gradient: 'linear-gradient(135deg, #06B6D4 0%, #0891b2 50%, #0E7490 100%)',
  bone: '#FAFBFC',
  ink: '#0F1A2A',
} as const;

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TokenInfo {
  doctor_id: string;
  doctor_name: string;
  plan_name: string;
  session_number: number;
  expires_at: string | null;
  is_schedulable: boolean;
}

type DoctorOffice = {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  schedule: { day: number; enabled: boolean; start: string; end: string }[];
  slotDuration: number;
  bufferMinutes: number;
  modality?: 'in_person' | 'online' | 'both';
};

type Slot = { date: string; time: string; label: string };

type PageState =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'not_schedulable'; info: TokenInfo; reason: string }
  | { kind: 'ready'; info: TokenInfo; offices: DoctorOffice[] }
  | { kind: 'success'; info: TokenInfo; scheduledAt: string };

// ── Helpers de slots (versión simplificada, sin minLeadDays) ──────────────────

const GENERIC_TIMES = [
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

function generateSlots(offices: DoctorOffice[], horizonDays = 56): Slot[] {
  const slots: Slot[] = [];
  const today = new Date();
  const hasOffices = offices.length > 0;

  for (let d = 1; d <= horizonDays; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    const jsDay = date.getDay();
    const scheduleDay = jsDay === 0 ? 6 : jsDay - 1;
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
        const scheds = off.schedule.filter((s) => s.day === scheduleDay && s.enabled);
        for (const sched of scheds) {
          const tt = timesBetween(
            sched.start,
            sched.end,
            off.slotDuration ?? 30,
            off.bufferMinutes ?? 0,
          );
          tt.forEach((t) => dayTimes.add(t));
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

function formatExpiresAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function AgendarTokenClient({ token }: { token: string }) {
  const [pageState, setPageState] = useState<PageState>({ kind: 'loading' });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [unavailableTimes, setUnavailableTimes] = useState<Map<string, Set<string>>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Cargar info del token al montar
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/public/pending-consultations/${encodeURIComponent(token)}`);
        const json = (await res.json()) as { data?: TokenInfo; error?: string };

        if (!res.ok || !json.data) {
          setPageState({
            kind: 'invalid',
            message: 'El enlace no es válido o ha expirado.',
          });
          return;
        }

        const info = json.data;

        if (!info.is_schedulable) {
          let reason = 'Esta consulta ya no está disponible para agendar.';
          if (info.expires_at && new Date(info.expires_at) < new Date()) {
            reason = 'El plazo para agendar esta consulta ha vencido.';
          }
          setPageState({ kind: 'not_schedulable', info, reason });
          return;
        }

        // Cargar consultorios del doctor
        let offices: DoctorOffice[] = [];
        try {
          const offRes = await fetch(`/api/booking/${encodeURIComponent(info.doctor_id)}/offices`);
          if (offRes.ok) {
            const offJson = (await offRes.json()) as {
              offices?: Array<{
                id: string;
                name: string;
                address: string;
                city: string;
                phone: string;
                schedule: { day: number; enabled: boolean; start: string; end: string }[];
                slotDuration: number;
                bufferMinutes: number;
                modality?: 'in_person' | 'online' | 'both';
              }>;
            };
            offices = offJson.offices ?? [];
          }
        } catch {
          // degradar: usar horario genérico
        }

        setPageState({ kind: 'ready', info, offices });
      } catch {
        setPageState({
          kind: 'invalid',
          message: 'No se pudo conectar con el servidor. Intenta de nuevo.',
        });
      }
    }
    void load();
  }, [token]);

  // Cargar slots no disponibles al seleccionar una fecha
  const loadUnavailableSlots = useCallback(
    async (date: string, doctorId: string) => {
      if (unavailableTimes.has(date)) return;
      try {
        const res = await fetch(`/api/booking/${encodeURIComponent(doctorId)}/slots?date=${date}`);
        if (!res.ok) return;
        const json = (await res.json()) as { slots?: { time: string; available: boolean }[] };
        const rawSlots = json?.slots;
        if (!Array.isArray(rawSlots)) return;

        const notAvailable = new Set<string>();
        for (const s of rawSlots) {
          if (s.available === false && s.time) {
            notAvailable.add(s.time.slice(0, 5));
          }
        }
        setUnavailableTimes((prev) => new Map(prev).set(date, notAvailable));
      } catch {
        // degradar silenciosamente
      }
    },
    [unavailableTimes],
  );

  const handleConfirm = async () => {
    if (!selectedSlot || pageState.kind !== 'ready') return;
    setSubmitting(true);
    setSubmitError('');

    try {
      const scheduledAt = new Date(
        `${selectedSlot.date}T${selectedSlot.time}:00-04:00`,
      ).toISOString();
      const res = await fetch(
        `/api/public/pending-consultations/${encodeURIComponent(token)}/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduled_at: scheduledAt }),
        },
      );

      const json = (await res.json()) as {
        data?: { appointment_id: string; scheduled_at: string };
        error?: string;
        code?: string;
      };

      if (!res.ok || !json.data) {
        if (res.status === 409 || json.code === 'slot_taken') {
          setSubmitError('Este horario ya no está disponible, por favor elige otro.');
          setSelectedSlot(null);
          setSelectedDate(null);
        } else {
          setSubmitError(json.error ?? 'No se pudo agendar la consulta. Intenta de nuevo.');
        }
        return;
      }

      setPageState({
        kind: 'success',
        info: pageState.info,
        scheduledAt: json.data.scheduled_at,
      });
    } catch {
      setSubmitError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  // La fuente Plus Jakarta Sans la inyecta el layout raíz (next/font/google → --font-sans).
  // No se necesita @import inline — heredamos la variable del <html> parent.

  const wrapper = (children: React.ReactNode) => (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: BRAND.bone }}
    >
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-8 max-w-md w-full">
        {children}
      </div>
    </div>
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (pageState.kind === 'loading') {
    return wrapper(
      <div className="flex flex-col items-center gap-4 py-8">
        <Loader2 className="w-10 h-10 animate-spin text-cyan-400" />
        <p className="text-sm text-slate-500">Cargando tu consulta…</p>
      </div>,
    );
  }

  // ── Invalid token ─────────────────────────────────────────────────────────
  if (pageState.kind === 'invalid') {
    return wrapper(
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Enlace no válido</h2>
        <p className="text-sm text-slate-500">{pageState.message}</p>
        <div className="mt-6 flex items-center justify-center gap-2 opacity-40">
          <DeltaMark size={18} bold />
          <span className="text-[10px] font-semibold text-slate-400">Delta Salud</span>
        </div>
      </div>,
    );
  }

  // ── Not schedulable ───────────────────────────────────────────────────────
  if (pageState.kind === 'not_schedulable') {
    const { info, reason } = pageState;
    return wrapper(
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
          <Calendar className="w-8 h-8 text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Consulta no disponible</h2>
        <p className="text-sm text-slate-500 mb-4">{reason}</p>
        <div className="text-left rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-1.5 text-xs text-slate-600">
          <p>
            <span className="font-semibold">Especialista:</span> {info.doctor_name}
          </p>
          <p>
            <span className="font-semibold">Plan:</span> {info.plan_name}
          </p>
          <p>
            <span className="font-semibold">Sesión:</span> {info.session_number}
          </p>
          {info.expires_at && (
            <p>
              <span className="font-semibold">Vencía:</span> {formatExpiresAt(info.expires_at)}
            </p>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-4">
          Si necesitas ayuda, contáctate directamente con tu especialista.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 opacity-40">
          <DeltaMark size={18} bold />
          <span className="text-[10px] font-semibold text-slate-400">Delta Salud</span>
        </div>
      </div>,
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (pageState.kind === 'success') {
    const { info, scheduledAt } = pageState;
    const dt = new Date(scheduledAt);
    const dateStr = dt.toLocaleDateString('es-VE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const timeStr = dt.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

    return wrapper(
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: BRAND.ink }}>
          ¡Consulta agendada!
        </h2>
        <p className="text-sm text-slate-500 mb-5">
          Tu consulta {info.session_number > 1 ? `(sesión ${info.session_number})` : ''} con{' '}
          <strong>{info.doctor_name}</strong> fue registrada.
        </p>
        <div
          className="rounded-xl p-4 text-left space-y-2.5 mb-5"
          style={{ background: BRAND.bone }}
        >
          <p className="text-xs text-slate-600">
            <span className="font-semibold">Plan:</span> {info.plan_name}
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Calendar className="w-3.5 h-3.5 text-cyan-500" />
            <span className="capitalize">{dateStr}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Clock className="w-3.5 h-3.5 text-cyan-500" />
            <span>{timeStr}</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-6">
          El especialista confirmará tu cita y se pondrá en contacto contigo.
        </p>
        <div className="flex items-center justify-center gap-2 opacity-40">
          <DeltaMark size={18} bold />
          <span className="text-[10px] font-semibold text-slate-400">Delta Salud</span>
        </div>
      </div>,
    );
  }

  // ── Ready: slot selector ───────────────────────────────────────────────────
  const { info, offices } = pageState;

  const allSlots = generateSlots(offices, 56);
  const grouped = groupByDate(allSlots);
  const dates = Object.keys(grouped).sort();
  const weekDates = dates.slice(weekOffset * 5, weekOffset * 5 + 5);
  const canPrevWeek = weekOffset > 0;
  const canNextWeek = (weekOffset + 1) * 5 < dates.length;

  const isSlotUnavailable = (date: string, time: string): boolean => {
    return unavailableTimes.get(date)?.has(time) ?? false;
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: BRAND.bone }}
    >
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100" style={{ background: BRAND.gradient }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white/70 text-[11px] font-semibold uppercase tracking-wider">
                Agendar consulta
              </p>
              <p className="text-white font-bold text-sm leading-tight">{info.doctor_name}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Info card */}
          <div className="rounded-xl bg-cyan-50/60 border border-cyan-200 p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Plan</span>
              <span className="text-xs font-bold text-slate-800">{info.plan_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Sesión</span>
              <span className="text-xs font-bold text-slate-800">#{info.session_number}</span>
            </div>
            {info.expires_at && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Vence</span>
                <span className="text-xs text-amber-700 font-semibold">
                  {formatExpiresAt(info.expires_at)}
                </span>
              </div>
            )}
          </div>

          {/* Week navigation */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Elige una fecha
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset((w) => w - 1);
                    setSelectedDate(null);
                    setSelectedSlot(null);
                  }}
                  disabled={!canPrevWeek}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:border-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Semana anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset((w) => w + 1);
                    setSelectedDate(null);
                    setSelectedSlot(null);
                  }}
                  disabled={!canNextWeek}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:border-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Semana siguiente"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {weekDates.map((dateStr) => {
                const daySlots = grouped[dateStr] ?? [];
                const isSel = selectedDate === dateStr;
                const d = new Date(dateStr + 'T12:00:00');
                const dayName = d.toLocaleDateString('es-VE', { weekday: 'short' });
                const dayNum = d.getDate();
                const monthName = d.toLocaleDateString('es-VE', { month: 'short' });

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => {
                      setSelectedDate(dateStr);
                      setSelectedSlot(null);
                      void loadUnavailableSlots(dateStr, info.doctor_id);
                    }}
                    disabled={daySlots.length === 0}
                    className={`flex flex-col items-center p-2 rounded-xl text-center transition-all border ${
                      daySlots.length === 0
                        ? 'border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed'
                        : isSel
                          ? 'border-transparent text-white shadow-md shadow-cyan-500/20'
                          : 'border-slate-200 bg-white hover:border-cyan-300 hover:shadow-sm'
                    }`}
                    style={isSel ? { background: BRAND.turquoise } : undefined}
                  >
                    <p
                      className={`text-[10px] font-semibold capitalize ${isSel ? 'text-white/70' : 'text-slate-400'}`}
                    >
                      {dayName}
                    </p>
                    <p className={`text-base font-bold ${isSel ? 'text-white' : 'text-slate-800'}`}>
                      {dayNum}
                    </p>
                    <p className={`text-[10px] ${isSel ? 'text-white/70' : 'text-slate-400'}`}>
                      {monthName}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time slots */}
          {selectedDate && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Horarios disponibles
              </p>
              {(() => {
                const daySlots = grouped[selectedDate] ?? [];
                if (daySlots.length === 0) {
                  return (
                    <p className="text-xs text-slate-400">
                      No hay horarios disponibles para este día.
                    </p>
                  );
                }
                return (
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map((slot) => {
                      const unavailable = isSlotUnavailable(slot.date, slot.time);
                      const isSel =
                        selectedSlot?.date === slot.date && selectedSlot?.time === slot.time;
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          onClick={() => {
                            if (!unavailable) {
                              setSelectedSlot(slot);
                              setSubmitError('');
                            }
                          }}
                          disabled={unavailable}
                          aria-disabled={unavailable}
                          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                            unavailable
                              ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                              : isSel
                                ? 'text-white shadow-md shadow-cyan-500/20'
                                : 'bg-white border border-slate-200 text-slate-700 hover:border-cyan-400 hover:bg-cyan-50/30'
                          }`}
                          style={isSel ? { background: BRAND.turquoise } : undefined}
                        >
                          {slot.time}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Selected slot summary */}
          {selectedSlot && (
            <div className="rounded-xl p-3.5 space-y-1" style={{ background: BRAND.bone }}>
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <Calendar className="w-3.5 h-3.5 text-cyan-500" />
                <span className="capitalize">{selectedSlot.label}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <Clock className="w-3.5 h-3.5 text-cyan-500" />
                <span className="font-bold">{selectedSlot.time}</span>
              </div>
            </div>
          )}

          {/* Error */}
          {submitError && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Confirm button */}
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!selectedSlot || submitting}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
            style={{ background: BRAND.gradient }}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Confirmando…
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4" />
                Confirmar cita
              </>
            )}
          </button>
        </div>

        {/* Footer branding */}
        <div className="flex items-center justify-center gap-2 py-4 border-t border-slate-100 opacity-30">
          <DeltaMark size={16} bold />
          <span className="text-[10px] font-semibold text-slate-400">Delta Salud</span>
        </div>
      </div>
    </div>
  );
}
