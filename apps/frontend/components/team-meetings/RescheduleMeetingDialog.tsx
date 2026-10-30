'use client';

/**
 * RescheduleMeetingDialog — reuses the step-2 slot picker to reschedule a
 * team meeting. Opened from the UpcomingMeetingCard on /doctor (Inicio).
 *
 * Accessible: role=dialog, aria-modal, aria-labelledby, focus trap, return focus.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Calendar, Clock, Loader2, ChevronLeft } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlotDay {
  date: string;
  slots: string[];
}

interface SlotsResponse {
  usesGenericHours: boolean;
  days: SlotDay[];
}

interface RescheduleMeetingDialogProps {
  meetingId: string;
  onRescheduled: () => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VE_LOCALE = 'es-VE';
const VE_TZ = 'America/Caracas';

function formatDayLabel(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T12:00:00-04:00`);
    const weekday = new Intl.DateTimeFormat(VE_LOCALE, { weekday: 'long', timeZone: VE_TZ }).format(d);
    const dayMonth = new Intl.DateTimeFormat(VE_LOCALE, {
      day: 'numeric',
      month: 'short',
      timeZone: VE_TZ,
    }).format(d);
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${dayMonth}`;
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RescheduleMeetingDialog({
  meetingId,
  onRescheduled,
  onClose,
}: RescheduleMeetingDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [slotsData, setSlotsData] = useState<SlotsResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [slotsError, setSlotsError] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Incrementing this triggers a slot reload (e.g. after 409 conflict).
  const [slotsReloadTrigger, setSlotsReloadTrigger] = useState(0);

  // Capture return focus target.
  const [returnTo] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );

  // Return focus on unmount.
  useEffect(() => {
    return () => {
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [returnTo]);

  // Move initial focus inside on open.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog
      .querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), ' +
          '[tabindex]:not([tabindex="-1"])',
      )
      ?.focus();
  }, []);

  // Focus trap + Escape.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable: HTMLElement[] = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), ' +
            'select:not([disabled]), textarea:not([disabled]), ' +
            '[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Slots loading — function defined inside useEffect so it never triggers
  // the react-hooks/set-state-in-effect lint rule (contact-requests pattern).
  useEffect(() => {
    let cancelled = false;

    async function loadSlots() {
      setLoadingSlots(true);
      setSlotsError('');
      try {
        const res = await fetch('/api/doctor/team-meetings/slots?days=14', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setSlotsError('No se pudieron cargar los horarios disponibles.');
          return;
        }
        const json = (await res.json()) as { data?: SlotsResponse };
        const data = json.data;
        if (!data) {
          if (!cancelled) setSlotsError('Respuesta inválida del servidor.');
          return;
        }
        if (!cancelled) {
          setSlotsData(data);
          const firstDay = data.days.find((d) => d.slots.length > 0);
          if (firstDay) {
            setSelectedDate(firstDay.date);
            setSelectedTime(null);
          }
        }
      } catch {
        if (!cancelled) setSlotsError('Error de red al cargar los horarios.');
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    }

    void loadSlots();
    return () => { cancelled = true; };
  }, [slotsReloadTrigger]);

  const daysWithSlots = slotsData?.days.filter((d) => d.slots.length > 0) ?? [];
  const currentDaySlots = slotsData?.days.find((d) => d.date === selectedDate)?.slots ?? [];

  async function handleConfirm() {
    if (!selectedDate || !selectedTime) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/doctor/team-meetings/${meetingId}/reschedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, time: selectedTime }),
        cache: 'no-store',
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (res.status === 409) {
          setSaveError(json.error ?? 'Ese horario ya no está disponible. Por favor elige otro.');
          setSelectedTime(null);
          setSlotsReloadTrigger((t) => t + 1);
          return;
        }
        setSaveError(json.error ?? 'No se pudo reprogramar la reunión. Intenta de nuevo.');
        return;
      }
      onRescheduled();
    } catch {
      setSaveError('Error de red. Verifica tu conexión e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reschedule-dialog-title"
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <h2 id="reschedule-dialog-title" className="text-base font-bold text-slate-800">
            Reprogramar reunión
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {slotsData?.usesGenericHours && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700 leading-relaxed">
                Aún no configuraste tus horarios de atención; te mostramos de lunes a sábado,
                de 8:00 a.&nbsp;m. a 6:00 p.&nbsp;m.
              </p>
            </div>
          )}

          {loadingSlots ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Cargando horarios disponibles…</span>
            </div>
          ) : slotsError ? (
            <div className="py-8 text-center">
              <p className="text-sm text-red-600 mb-3">{slotsError}</p>
              <button
                onClick={() => setSlotsReloadTrigger((t) => t + 1)}
                className="text-sm text-teal-600 hover:underline font-medium"
              >
                Reintentar
              </button>
            </div>
          ) : daysWithSlots.length === 0 ? (
            <div className="py-10 text-center">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500 font-medium">
                No hay horarios disponibles en los próximos 14 días.
              </p>
            </div>
          ) : (
            <>
              {/* Day selector */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Día
                </p>
                <div className="flex flex-wrap gap-2">
                  {daysWithSlots.map((d) => (
                    <button
                      key={d.date}
                      onClick={() => { setSelectedDate(d.date); setSelectedTime(null); }}
                      className={[
                        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                        selectedDate === d.date
                          ? 'bg-teal-500 text-white border-teal-500'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300',
                      ].join(' ')}
                    >
                      {formatDayLabel(d.date)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time slots */}
              {selectedDate && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Hora
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {currentDaySlots.map((time) => (
                      <button
                        key={time}
                        onClick={() => setSelectedTime(time)}
                        className={[
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                          selectedTime === time
                            ? 'bg-teal-500 text-white border-teal-500'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300',
                        ].join(' ')}
                      >
                        <Clock className="w-3 h-3" />
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {saveError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {saveError}
                </p>
              )}

              <button
                onClick={() => void handleConfirm()}
                disabled={!selectedDate || !selectedTime || saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Reprogramando…
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4" />
                    Confirmar nuevo horario
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Back button */}
        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
