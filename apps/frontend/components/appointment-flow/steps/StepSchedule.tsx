'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react';
import { DoctorOffice, getTimeSlotsForDate, jsDayToScheduleDay } from '../appointment-flow.utils';

type DayInfo = {
  date: string;
  weekday: string;
  dayNum: string;
  month: string;
  enabled: boolean;
};

type Props = {
  selectedOffice: DoctorOffice | null;
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  selectedTime: string;
  selectTime: (t: string) => void;
  weekOffset: number;
  setWeekOffset: (n: number) => void;
  unavailableTimes: Map<string, Set<string>>;
  loadingSlots: boolean;
  scheduledAt: string;
  /** Duración elegida a mano. null = la manda el bloque del consultorio. */
  customDuration: number | null;
  /** Fija hora y duración fuera de la grilla. */
  selectCustomSlot: (time: string, durationMinutes: number) => void;
};

const PAGE_SIZE = 5;
const HORIZON_DAYS = 60;
/**
 * El especialista puede retroceder SIN LÍMITE.
 *
 * Este flujo es SOLO del especialista (NewAppointmentFlow); el booking público
 * del paciente vive en app/book/[doctorId] y no usa este componente, así que
 * abrir el pasado acá no le habilita al paciente agendar hacia atrás.
 *
 * Por qué: si atendió a alguien ayer (por ejemplo, se fue la luz y no pudo
 * cargarlo en el momento), tiene que poder dejar el registro con la fecha real
 * en vez de inventar una de hoy. Antes el tope era de 30 días; el dueño pidió
 * que no hubiera tope, así que la ventana visible se calcula a partir del
 * offset en vez de recortarse contra un arreglo de largo fijo.
 *
 * Una cita con fecha pasada creada por el especialista nace ATENDIDA
 * (el backend lo resuelve en computeInitialStatus).
 */

function fmtDateTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-VE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Caracas',
  });
}

/** YYYY-MM-DD de una fecha en la zona del navegador (la misma que arma la grilla). */
function toYMD(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Días calendario entre dos YYYY-MM-DD. Se anclan al mediodía UTC para que un
 * cambio de horario de verano no corra el resultado un día.
 */
function daysBetween(fromYMD: string, toYMDStr: string): number {
  const from = Date.parse(`${fromYMD}T12:00:00Z`);
  const to = Date.parse(`${toYMDStr}T12:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export default function StepSchedule({
  selectedOffice,
  selectedDate,
  setSelectedDate,
  selectedTime,
  selectTime,
  weekOffset,
  setWeekOffset,
  unavailableTimes,
  loadingSlots,
  scheduledAt,
  customDuration,
  selectCustomSlot,
}: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const [customTime, setCustomTime] = useState('');
  const [customMinutes, setCustomMinutes] = useState('60');

  // Un día está habilitado si el consultorio atiende ese día de la semana.
  // Sin horario cargado se habilitan todos (el flujo cae a horarios genéricos).
  const isDayEnabled = useCallback(
    (d: Date): boolean => {
      if (!selectedOffice?.schedule || selectedOffice.schedule.length === 0) return true;
      const schedDay = jsDayToScheduleDay(d.getDay());
      return selectedOffice.schedule.some((s) => s.day === schedDay && s.enabled);
    },
    [selectedOffice],
  );

  // Solo se construyen los PAGE_SIZE días visibles, corridos por weekOffset:
  // 0 = la página que empieza hoy, negativo = hacia atrás (sin tope), positivo
  // = hacia adelante hasta HORIZON_DAYS.
  const visibleDays: DayInfo[] = useMemo(() => {
    const today = new Date();
    const result: DayInfo[] = [];
    for (let i = 0; i < PAGE_SIZE; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + weekOffset * PAGE_SIZE + i);
      result.push({
        date: toYMD(d),
        weekday: d.toLocaleDateString('es-VE', { weekday: 'short' }).toUpperCase(),
        dayNum: String(d.getDate()),
        month: d.toLocaleDateString('es-VE', { month: 'short' }).toUpperCase(),
        enabled: isDayEnabled(d),
      });
    }
    return result;
  }, [isDayEnabled, weekOffset]);

  // Hacia atrás no hay tope; hacia adelante se respeta el horizonte de 60 días.
  const canPrev = true;
  const canNext = (weekOffset + 1) * PAGE_SIZE < HORIZON_DAYS;
  const rangeLabel =
    visibleDays.length > 0
      ? `${visibleDays[0].dayNum} ${visibleDays[0].month} — ${visibleDays[visibleDays.length - 1].dayNum} ${visibleDays[visibleDays.length - 1].month}`
      : '';

  // Generate time slots for the selected date
  const timeSlots: string[] = useMemo(() => {
    if (!selectedDate) return [];
    return getTimeSlotsForDate(selectedDate, selectedOffice);
  }, [selectedDate, selectedOffice]);

  const unavailableForDate = unavailableTimes.get(selectedDate) ?? new Set<string>();

  // Bloquear horas ya pasadas cuando la fecha seleccionada es HOY (hora de
  // Venezuela, UTC-4). No debe poder agendarse una consulta en el pasado.
  const nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const nowPart = (t: string) => nowParts.find((p) => p.type === t)?.value ?? '';
  const todayCaracas = `${nowPart('year')}-${nowPart('month')}-${nowPart('day')}`;
  const nowHour = nowPart('hour') === '24' ? '00' : nowPart('hour');
  const nowHHMM = `${nowHour}:${nowPart('minute')}`;
  const isTodaySelected = selectedDate === todayCaracas;

  // ¿La fecha+hora elegidas ya pasaron? Se compara contra los mismos strings de
  // Caracas que usa la grilla de horas, en vez de volver a leer el reloj.
  const isPastSelection =
    selectedDate < todayCaracas ||
    (isTodaySelected && Boolean(selectedTime) && selectedTime <= nowHHMM);

  // If no office schedule, show a hint about generic times
  const usingGenericTimes =
    !selectedOffice || !selectedOffice.schedule || selectedOffice.schedule.length === 0;

  return (
    <div className="space-y-3">
      {usingGenericTimes && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-start gap-2 text-xs text-blue-800">
          <span>
            Usando horarios genéricos (8am–12pm y 2pm–6pm). Configura tu consultorio en{' '}
            <a href="/doctor/offices" className="font-bold underline">
              Consultorio
            </a>{' '}
            para usar tus horarios reales.
          </span>
        </div>
      )}

      {/* Selector de fecha paginado */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Selecciona el día
            </p>
            {/* Atajo: retroceder de a 5 días no sirve para una atención de hace
                meses. Mueve la ventana a la fecha elegida y, si ese día se
                atiende, la deja seleccionada. */}
            <input
              type="date"
              value={selectedDate || ''}
              onChange={(e) => {
                const target = e.target.value;
                if (!target) return;
                setWeekOffset(Math.floor(daysBetween(toYMD(new Date()), target) / PAGE_SIZE));
                const [y, m, d] = target.split('-').map(Number);
                if (isDayEnabled(new Date(y, (m ?? 1) - 1, d))) setSelectedDate(target);
              }}
              aria-label="Ir a una fecha"
              title="Ir a una fecha"
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:border-teal-300 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekOffset(weekOffset - 1)}
              disabled={!canPrev}
              className="w-8 h-8 rounded-xl bg-white border border-slate-200 hover:border-teal-300 hover:bg-teal-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              aria-label="Semana anterior"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
            </button>
            <span className="text-xs font-semibold text-slate-600 min-w-[7rem] text-center">
              {rangeLabel}
            </span>
            <button
              type="button"
              onClick={() => setWeekOffset(weekOffset + 1)}
              disabled={!canNext}
              className="w-8 h-8 rounded-xl bg-white border border-slate-200 hover:border-teal-300 hover:bg-teal-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              aria-label="Semana siguiente"
            >
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {visibleDays.map((d) => {
            const isActive = selectedDate === d.date;
            const isPastDay = d.date < todayCaracas;
            return (
              <button
                key={d.date}
                type="button"
                disabled={!d.enabled}
                onClick={() => {
                  if (d.enabled) {
                    setSelectedDate(d.date);
                  }
                }}
                title={
                  isPastDay ? 'Día pasado — para registrar una atención ya ocurrida' : undefined
                }
                className={`flex flex-col items-center justify-center h-20 rounded-xl border-2 transition-all ${
                  !d.enabled
                    ? 'bg-slate-100 border-slate-100 opacity-40 cursor-not-allowed'
                    : isActive
                      ? 'bg-teal-500 text-white border-teal-500 shadow-md'
                      : isPastDay
                        ? 'bg-white text-slate-500 border-dashed border-slate-300 hover:border-teal-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300'
                }`}
              >
                <span
                  className={`text-[10px] font-bold ${isActive ? 'text-teal-100' : 'text-slate-500'}`}
                >
                  {d.weekday}
                </span>
                <span className="text-2xl font-bold">{d.dayNum}</span>
                <span className={`text-[10px] ${isActive ? 'text-teal-100' : 'text-slate-500'}`}>
                  {d.month}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selector de hora */}
      {selectedDate && (
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Hora disponible
            {loadingSlots && (
              <span className="ml-2 inline-flex items-center gap-1 font-normal normal-case text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" /> verificando ocupados...
              </span>
            )}
          </p>
          {timeSlots.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">
              No hay horarios disponibles para este día.
            </p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {timeSlots.map((t) => {
                // El horario pasado se marca, pero NO se bloquea: el especialista
                // puede estar registrando una atención de hace un rato o de ayer.
                // Ocupado sí bloquea (ya hay otra cita en ese slot).
                const isPast = (isTodaySelected && t <= nowHHMM) || selectedDate < todayCaracas;
                const isUnavailable = unavailableForDate.has(t);
                const isActive = selectedTime === t;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={isUnavailable}
                    onClick={() => selectTime(t)}
                    title={
                      isUnavailable
                        ? 'Horario ocupado'
                        : isPast
                          ? 'Horario pasado — puedes registrar una atención ya ocurrida'
                          : undefined
                    }
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      isUnavailable
                        ? 'bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed'
                        : isActive
                          ? 'bg-teal-500 text-white border-teal-500'
                          : isPast
                            ? 'bg-white text-slate-500 border-dashed border-slate-300 hover:border-teal-300'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Hora libre: para encajar una consulta en un hueco que la grilla no
          ofrece (ej. 9:30 a 10:30 cuando los bloques son de 8-9, 9-10, 10-11).
          El backend no exige que la hora caiga en un slot: solo rechaza si
          pisa otra cita, y ahí sí avisa. */}
      {selectedDate && (
        <div className="border border-slate-200 rounded-lg">
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <span>Otra hora</span>
            <span className="text-slate-400 font-normal">
              {customDuration ? `${customDuration} min` : 'fuera de la grilla'}
            </span>
          </button>

          {showCustom && (
            <div className="px-3 pb-3 space-y-2">
              <p className="text-[11px] text-slate-500">
                Para encajar una consulta entre horarios. Si se cruza con una cita ya agendada, no
                se va a poder guardar.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Hora</span>
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">
                    Duración
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="5"
                      max="480"
                      step="5"
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(e.target.value)}
                      className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
                    />
                    <span className="text-xs text-slate-400">min</span>
                  </div>
                </label>
                <button
                  type="button"
                  disabled={!customTime || !(Number(customMinutes) >= 5)}
                  onClick={() => selectCustomSlot(customTime, Number(customMinutes))}
                  className="px-3 py-1.5 bg-teal-500 text-white rounded-lg text-xs font-semibold hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Usar esta hora
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {scheduledAt && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-xs font-semibold text-emerald-800">{fmtDateTime(scheduledAt)}</span>
          {customDuration ? (
            <span className="text-xs text-emerald-600 ml-1">— {customDuration} minutos</span>
          ) : (
            <span className="text-xs text-emerald-600 ml-1">
              — al seleccionar la hora avanzas automáticamente
            </span>
          )}
        </div>
      )}

      {/* Aviso de consulta retroactiva: el backend la crea directamente como
          atendida, así que conviene decirlo ANTES de guardar y no después. */}
      {scheduledAt && isPastSelection && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2 text-xs text-amber-800">
          <span>
            Esta fecha ya pasó: la consulta se va a registrar como <strong>atendida</strong>.
          </span>
        </div>
      )}
    </div>
  );
}
