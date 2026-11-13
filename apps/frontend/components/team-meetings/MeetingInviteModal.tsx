'use client';

/**
 * MeetingInviteModal — "Queremos conocerte" modal (Phase 3 — retention plan).
 *
 * Three steps:
 *   1. Introduction — owner-approved text + three action buttons.
 *   2. Schedule picker — day selector + time slots from the doctor's own availability.
 *   3. Success — confirmation with meeting URL.
 *
 * Rules (spec E, B.3):
 *   - On mount: POST /api/doctor/prompts/meeting/shown (fire-and-forget).
 *   - "Ahora no" → POST snooze → close.
 *   - "No me interesa" → POST dismiss → close.
 *   - X / Escape → same as "Ahora no" (snooze).
 *   - Accessible: role=dialog, aria-modal, aria-labelledby, focus trap, return focus.
 *   - If usesGenericHours is true, show note about unconfigured schedule.
 *   - Empty state when no slots are available.
 *   - 409/422 errors shown inline; reload slots on conflict.
 *   - Dates always in America/Caracas.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Calendar, Clock, CheckCircle, Loader2, Video, ExternalLink, ChevronLeft } from 'lucide-react';

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

interface CreatedMeeting {
  id: string;
  startsAt: string;
  endsAt: string;
  meetingUrl: string | null;
}

interface MeetingInviteModalProps {
  doctorName: string;
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
    const weekday = new Intl.DateTimeFormat(VE_LOCALE, {
      weekday: 'long',
      timeZone: VE_TZ,
    }).format(d);
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

function formatDateTimeLong(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat(VE_LOCALE, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: VE_TZ,
    }).format(new Date(isoStr));
  } catch {
    return isoStr;
  }
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function StepIntro({
  doctorName,
  onSchedule,
  onSnooze,
  onDismiss,
  busy,
}: {
  doctorName: string;
  onSchedule: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  return (
    <div className="px-6 py-5 space-y-5">
      {/* Icon */}
      <div className="flex items-center justify-center">
        <div className="w-14 h-14 rounded-full g-bg flex items-center justify-center">
          <Video className="w-7 h-7 text-white" />
        </div>
      </div>

      {/* Text */}
      <div className="text-center space-y-3">
        <h2
          id="meeting-modal-title"
          className="text-xl font-bold text-slate-800 leading-snug"
        >
          {doctorName}, queremos conocerte
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed max-w-sm mx-auto">
          Estamos construyendo Delta junto a especialistas como tú. Nos encantaría escuchar
          tu experiencia: qué te sirve, qué no, y qué te falta. Son 30 minutos por
          videollamada, y como agradecimiento te regalamos un mes más de Delta.
        </p>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-1">
        <button
          onClick={onSchedule}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-60 transition-colors"
        >
          <Calendar className="w-4 h-4" />
          Agendar reunión
        </button>
        <button
          onClick={onSnooze}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Ahora no
        </button>
        <button
          onClick={onDismiss}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-600 disabled:opacity-60 transition-colors"
        >
          No me interesa
        </button>
      </div>
    </div>
  );
}

function StepSchedule({
  onBack,
  onConfirmed,
  isReschedule,
  meetingId,
}: {
  onBack: () => void;
  onConfirmed: (meeting: CreatedMeeting) => void;
  isReschedule?: boolean;
  meetingId?: string;
}) {
  const [slotsData, setSlotsData] = useState<SlotsResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [slotsError, setSlotsError] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState('');
  // Incrementing this triggers a slot reload (e.g. after 409 conflict).
  const [slotsReloadTrigger, setSlotsReloadTrigger] = useState(0);

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
          // Pre-select first day with slots; also reset time.
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

  const currentDaySlots =
    slotsData?.days.find((d) => d.date === selectedDate)?.slots ?? [];

  async function handleConfirm() {
    if (!selectedDate || !selectedTime) return;
    setBooking(true);
    setBookError('');
    try {
      const endpoint = isReschedule && meetingId
        ? `/api/doctor/team-meetings/${meetingId}/reschedule`
        : '/api/doctor/team-meetings';
      const method = isReschedule ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, time: selectedTime }),
        cache: 'no-store',
      });
      const json = (await res.json()) as { data?: CreatedMeeting; error?: string };

      if (!res.ok) {
        if (res.status === 409) {
          // Conflict — slot taken; reload slots via trigger.
          setBookError(json.error ?? 'Ese horario ya no está disponible. Por favor elige otro.');
          setSelectedTime(null);
          setSlotsReloadTrigger((t) => t + 1);
          return;
        }
        setBookError(json.error ?? 'No se pudo agendar la reunión. Intenta de nuevo.');
        return;
      }

      if (!json.data) {
        setBookError('Respuesta inesperada del servidor. Intenta de nuevo.');
        return;
      }
      onConfirmed(json.data);
    } catch {
      setBookError('Error de red. Verifica tu conexión e intenta de nuevo.');
    } finally {
      setBooking(false);
    }
  }

  const daysWithSlots = slotsData?.days.filter((d) => d.slots.length > 0) ?? [];

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Volver"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 id="meeting-modal-title" className="text-base font-bold text-slate-800">
          Elige un horario de tu agenda
        </h2>
      </div>

      {slotsData?.usesGenericHours && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-700 leading-relaxed">
            Aún no configuraste tus horarios de atención; te mostramos de lunes a sábado,
            de 8:00 a.&nbsp;m. a 6:00 p.&nbsp;m.{' '}
            <a
              href="/doctor/settings?tab=schedule"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline hover:text-amber-900"
            >
              Configurar horarios
            </a>
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
          <p className="text-xs text-slate-400 mt-1">
            Escríbenos por WhatsApp y coordinamos directamente.
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
                      : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700',
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
                        : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700',
                    ].join(' ')}
                  >
                    <Clock className="w-3 h-3" />
                    {time}
                  </button>
                ))}
              </div>
            </div>
          )}

          {bookError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {bookError}
            </p>
          )}

          <div className="pt-1">
            <button
              onClick={() => void handleConfirm()}
              disabled={!selectedDate || !selectedTime || booking}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {booking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Agendando…
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" />
                  Confirmar reunión
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function StepSuccess({
  meeting,
  onClose,
}: {
  meeting: CreatedMeeting;
  onClose: () => void;
}) {
  return (
    <div className="px-6 py-5 space-y-5">
      {/* Icon */}
      <div className="flex items-center justify-center">
        <div className="w-14 h-14 rounded-full bg-teal-50 border-2 border-teal-200 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-teal-500" />
        </div>
      </div>

      {/* Title */}
      <div className="text-center space-y-2">
        <h2 id="meeting-modal-title" className="text-xl font-bold text-slate-800">
          ¡Reunión agendada!
        </h2>
        <p className="text-sm font-semibold text-slate-700">
          {formatDateTimeLong(meeting.startsAt)}
        </p>
        <p className="text-xs text-slate-500 leading-relaxed">
          Te enviamos la invitación por correo; también quedó bloqueada esa hora en tu agenda.
        </p>
      </div>

      {/* Link */}
      {meeting.meetingUrl && (
        <a
          href={meeting.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-teal-200 bg-teal-50 text-teal-700 text-sm font-semibold hover:bg-teal-100 transition-colors"
        >
          <Video className="w-4 h-4" />
          Unirme a la reunión
          <ExternalLink className="w-3.5 h-3.5 opacity-60" />
        </a>
      )}

      {/* Close */}
      <button
        onClick={onClose}
        className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
      >
        Listo
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

type Step = 'intro' | 'schedule' | 'success';

export default function MeetingInviteModal({ doctorName, onClose }: MeetingInviteModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>('intro');
  const [createdMeeting, setCreatedMeeting] = useState<CreatedMeeting | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Capture return focus target before any buttons move focus.
  const [returnTo] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );

  // Declare these before the useEffects that reference them so that the
  // `const` bindings are in scope (no temporal dead zone with useCallback).
  const handleSnooze = useCallback(async () => {
    setActionBusy(true);
    try {
      await fetch('/api/doctor/prompts/meeting/snooze', { method: 'POST', cache: 'no-store' });
    } catch {
      // Non-critical — close anyway.
    } finally {
      setActionBusy(false);
      onClose();
    }
  }, [onClose]);

  const handleDismiss = useCallback(async () => {
    setActionBusy(true);
    try {
      await fetch('/api/doctor/prompts/meeting/dismiss', { method: 'POST', cache: 'no-store' });
    } catch {
      // Non-critical — close anyway.
    } finally {
      setActionBusy(false);
      onClose();
    }
  }, [onClose]);

  const handleXClose = useCallback(() => {
    if (step === 'success') {
      onClose();
    } else {
      void handleSnooze();
    }
  }, [step, onClose, handleSnooze]);

  // POST shown once on mount (fire-and-forget).
  useEffect(() => {
    void fetch('/api/doctor/prompts/meeting/shown', { method: 'POST', cache: 'no-store' }).catch(
      () => {/* non-critical */},
    );
  }, []);

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
  }, [step]);

  // Focus trap + Escape. handleSnooze is declared above so the closure is valid.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (step === 'success') {
          onClose();
        } else {
          void handleSnooze();
        }
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
  }, [step, onClose, handleSnooze]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleXClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-modal-title"
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-y-auto"
      >
        {/* Close button */}
        <button
          onClick={handleXClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Steps */}
        {step === 'intro' && (
          <StepIntro
            doctorName={doctorName}
            onSchedule={() => setStep('schedule')}
            onSnooze={() => void handleSnooze()}
            onDismiss={() => void handleDismiss()}
            busy={actionBusy}
          />
        )}
        {step === 'schedule' && (
          <StepSchedule
            onBack={() => setStep('intro')}
            onConfirmed={(m) => {
              setCreatedMeeting(m);
              setStep('success');
            }}
          />
        )}
        {step === 'success' && createdMeeting && (
          <StepSuccess meeting={createdMeeting} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
