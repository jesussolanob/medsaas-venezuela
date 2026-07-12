'use client';

import { useMemo } from 'react';
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
};

const PAGE_SIZE = 5;
const HORIZON_DAYS = 60;

function fmtDateTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-VE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Caracas',
  });
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
}: Props) {
  // Build 60-day array with enabled/disabled status based on office schedule
  const days: DayInfo[] = useMemo(() => {
    const today = new Date();
    const result: DayInfo[] = [];
    for (let i = 0; i < HORIZON_DAYS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      let enabled = true;
      if (selectedOffice?.schedule && selectedOffice.schedule.length > 0) {
        const jsDay = d.getDay();
        const schedDay = jsDayToScheduleDay(jsDay);
        const hasSched = selectedOffice.schedule.some((s) => s.day === schedDay && s.enabled);
        enabled = hasSched;
      }

      result.push({
        date: dateStr,
        weekday: d.toLocaleDateString('es-VE', { weekday: 'short' }).toUpperCase(),
        dayNum: String(d.getDate()),
        month: d.toLocaleDateString('es-VE', { month: 'short' }).toUpperCase(),
        enabled,
      });
    }
    return result;
  }, [selectedOffice]);

  const visibleDays = days.slice(weekOffset * PAGE_SIZE, weekOffset * PAGE_SIZE + PAGE_SIZE);
  const canPrev = weekOffset > 0;
  const canNext = (weekOffset + 1) * PAGE_SIZE < days.length;
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
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Selecciona el día
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
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
                className={`flex flex-col items-center justify-center h-20 rounded-xl border-2 transition-all ${
                  !d.enabled
                    ? 'bg-slate-100 border-slate-100 opacity-40 cursor-not-allowed'
                    : isActive
                      ? 'bg-teal-500 text-white border-teal-500 shadow-md'
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
                const isPast = isTodaySelected && t <= nowHHMM;
                const isUnavailable = unavailableForDate.has(t) || isPast;
                const isActive = selectedTime === t;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={isUnavailable}
                    onClick={() => selectTime(t)}
                    title={
                      isPast
                        ? 'Hora ya pasada'
                        : isUnavailable
                          ? 'Horario no disponible'
                          : undefined
                    }
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      isUnavailable
                        ? 'bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed'
                        : isActive
                          ? 'bg-teal-500 text-white border-teal-500'
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

      {scheduledAt && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-xs font-semibold text-emerald-800">{fmtDateTime(scheduledAt)}</span>
          <span className="text-xs text-emerald-600 ml-1">
            — al seleccionar la hora avanzas automáticamente
          </span>
        </div>
      )}
    </div>
  );
}
