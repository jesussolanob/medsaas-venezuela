'use client';

/**
 * UpcomingMeetingCard — shows the doctor's upcoming team meeting on /doctor (Inicio).
 *
 * Features:
 *   - Date/time in America/Caracas.
 *   - "Unirme" button (opens meeting URL in new tab).
 *   - "Reprogramar" — opens RescheduleMeetingDialog (hidden if < 2 h away).
 *   - "Cancelar" — inline confirmation without confirm() — hidden if < 2 h away.
 *   - If < 2 h remain, shows note "Ya no se puede reprogramar ni cancelar (faltan menos
 *     de 2 horas)".
 *   - Reloads meeting data after reschedule / cancel.
 */

import { useEffect, useState } from 'react';
import { Video, X, ExternalLink, RefreshCcw, Loader2, AlertCircle } from 'lucide-react';
import RescheduleMeetingDialog from './RescheduleMeetingDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CurrentMeeting {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  meetingUrl: string | null;
  source: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VE_LOCALE = 'es-VE';
const VE_TZ = 'America/Caracas';

function formatMeetingDateTime(isoStr: string): string {
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

/** Returns true if the meeting starts in less than 2 hours from now. */
function isWithin2Hours(isoStr: string): boolean {
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  return new Date(isoStr).getTime() - Date.now() < TWO_HOURS_MS;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UpcomingMeetingCard() {
  const [meeting, setMeeting] = useState<CurrentMeeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReschedule, setShowReschedule] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  // Incrementing this triggers a data reload (e.g. after reschedule).
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Meeting loading — function defined inside useEffect so it never triggers
  // the react-hooks/set-state-in-effect lint rule (contact-requests pattern).
  useEffect(() => {
    let cancelled = false;

    async function loadMeeting() {
      setLoading(true);
      try {
        const res = await fetch('/api/doctor/team-meetings/current', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: CurrentMeeting | null };
        if (!cancelled) setMeeting(json.data ?? null);
      } catch {
        // Silently ignore — card is non-critical.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMeeting();
    return () => { cancelled = true; };
  }, [reloadTrigger]);

  async function handleCancel() {
    if (!meeting) return;
    setCancelling(true);
    setCancelError('');
    try {
      const res = await fetch(`/api/doctor/team-meetings/${meeting.id}`, {
        method: 'DELETE',
        cache: 'no-store',
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setCancelError(json.error ?? 'No se pudo cancelar la reunión.');
        return;
      }
      setMeeting(null);
      setConfirmCancel(false);
    } catch {
      setCancelError('Error de red. Intenta de nuevo.');
    } finally {
      setCancelling(false);
    }
  }

  // Don't render anything if loading or no meeting.
  if (loading || !meeting) return null;

  const tooSoon = isWithin2Hours(meeting.startsAt);
  const dtLabel = formatMeetingDateTime(meeting.startsAt);

  return (
    <>
      <div className="bg-white border border-teal-200 rounded-xl p-5 shadow-sm">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg g-bg flex items-center justify-center shrink-0">
              <Video className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
                Reunión con el equipo Delta
              </p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{dtLabel}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {meeting.meetingUrl && (
            <a
              href={meeting.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-500 text-white text-sm font-semibold hover:bg-teal-600 transition-colors"
            >
              <Video className="w-3.5 h-3.5" />
              Unirme
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>
          )}

          {!tooSoon && (
            <>
              <button
                onClick={() => {
                  setConfirmCancel(false);
                  setShowReschedule(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                Reprogramar
              </button>

              {!confirmCancel ? (
                <button
                  onClick={() => setConfirmCancel(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 font-medium">¿Cancelar la reunión?</span>
                  <button
                    onClick={() => void handleCancel()}
                    disabled={cancelling}
                    className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 disabled:opacity-60 transition-colors"
                  >
                    {cancelling ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      'Sí, cancelar'
                    )}
                  </button>
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    No
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {tooSoon && (
          <p className="text-xs text-slate-500 mt-3 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-amber-500" />
            Ya no se puede reprogramar ni cancelar (faltan menos de 2 horas).
          </p>
        )}

        {cancelError && (
          <p className="text-xs text-red-600 mt-2">{cancelError}</p>
        )}
      </div>

      {showReschedule && (
        <RescheduleMeetingDialog
          meetingId={meeting.id}
          onRescheduled={() => {
            setShowReschedule(false);
            setReloadTrigger((t) => t + 1);
          }}
          onClose={() => setShowReschedule(false)}
        />
      )}
    </>
  );
}
