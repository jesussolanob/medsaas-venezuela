'use client';

/**
 * DoctorNotificationToast.tsx
 *
 * ETAPA 1: Supabase Realtime removed. No WebSocket layer in Etapa 1.
 *
 * Strategy: poll GET /api/appointments?status=scheduled&created_after=<iso>
 * via a server action every 30 seconds. On the first poll we record known IDs
 * so we only toast truly new bookings on subsequent polls.
 *
 * If the backend does not yet expose a `created_after` filter, we filter
 * client-side against a 2-minute window from the last known timestamp.
 *
 * FASE 5: Replace setInterval with a proper SSE / WebSocket push channel
 * once the backend implements it.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { Bell, X, Calendar, User } from 'lucide-react';
import { getRecentAppointmentsForNotification } from './notification-actions';
import { reportError } from '@/lib/report-error';
import { useBcvRate } from '@/lib/useBcvRate';

type NewBooking = {
  id: string;
  patient_name: string;
  scheduled_at: string;
  plan_name: string | null;
  plan_price: number | null;
  type: 'appointment' | 'consultation';
};

type Toast = {
  id: string;
  booking: NewBooking;
  visible: boolean;
};

/**
 * Messages Next.js emits when a poll invokes a server action belonging to a
 * bundle that a new deploy already replaced (version skew). They are transient —
 * the next poll runs against the fresh bundle — so they must never reach Sentry.
 *
 * Both need substring matching: the first embeds the action id
 * (`Server Action "<hash>" was not found on the server.`) and the second is the
 * generic transport error Next.js raises when the action response is not a valid
 * RSC payload (a 404 or an HTML redirect from the stale deployment).
 */
const VERSION_SKEW_MESSAGES = [
  'was not found on the server',
  'An unexpected response was received from the server',
] as const;

function isVersionSkewError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return VERSION_SKEW_MESSAGES.some((fragment) => error.message.includes(fragment));
}

export default function DoctorNotificationToast() {
  // Monto en la divisa del especialista, no en dolar fijo.
  const { format: fmtMoney } = useBcvRate();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const soundEnabledRef = useRef(true);

  // Load sound preference
  useEffect(() => {
    const saved = localStorage.getItem('appt_sound_enabled');
    if (saved !== null) soundEnabledRef.current = saved === 'true';
  }, []);

  const playSound = useCallback(() => {
    if (!soundEnabledRef.current) return;
    try {
      const ctx = new AudioContext();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.value = 587.33; // D5
      osc2.frequency.value = 783.99; // G5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime + 0.15);
      osc1.stop(ctx.currentTime + 0.4);
      osc2.stop(ctx.currentTime + 0.6);
    } catch {
      // AudioContext may be blocked before user interaction — ignore silently.
    }
  }, []);

  const showToast = useCallback(
    (booking: NewBooking) => {
      const toastId = `toast-${booking.id}-${Date.now()}`;
      setToasts((prev) => [...prev, { id: toastId, booking, visible: true }]);
      playSound();

      // Auto-dismiss after 8 seconds
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === toastId ? { ...t, visible: false } : t)));
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toastId));
        }, 500);
      }, 8000);
    },
    [playSound],
  );

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.map((t) => (t.id === toastId ? { ...t, visible: false } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, 500);
  }, []);

  // Poll for new appointments every 30 seconds via backend server action.
  useEffect(() => {
    async function checkNewBookings() {
      try {
        const recent = await getRecentAppointmentsForNotification();

        // On first load, record existing IDs so we don't toast stale bookings.
        if (!initializedRef.current) {
          recent.forEach((a) => knownIdsRef.current.add(`appt-${a.id}`));
          initializedRef.current = true;
          return;
        }

        for (const appt of recent) {
          const key = `appt-${appt.id}`;
          if (!knownIdsRef.current.has(key)) {
            knownIdsRef.current.add(key);
            showToast({
              id: appt.id,
              patient_name: appt.patient_name,
              scheduled_at: appt.scheduled_at,
              plan_name: appt.plan_name,
              plan_price: appt.plan_price,
              type: 'appointment',
            });
          }
        }
      } catch (err) {
        // Non-blocking — polling errors do not surface to the user.
        // Version-skew errors are dropped: they fire when Next.js deploys a new
        // bundle mid-session and the next poll picks up the updated action.
        if (isVersionSkewError(err)) {
          return;
        }
        reportError('DoctorNotificationToast', 'checkNewBookings', err);
      }
    }

    checkNewBookings();
    const interval = setInterval(checkNewBookings, 30000);
    return () => clearInterval(interval);
  }, [showToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none"
      style={{ maxWidth: '380px' }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto bg-white border border-teal-200 rounded-xl shadow-xl shadow-teal-100/50 p-4 transition-all duration-500 ${
            toast.visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-teal-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900">Nueva consulta agendada</p>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <User className="w-3 h-3 text-slate-400" />
                <p className="text-sm text-slate-700 font-medium truncate">
                  {toast.booking.patient_name}
                </p>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3 h-3 text-slate-400" />
                <p className="text-xs text-slate-500">
                  {new Date(toast.booking.scheduled_at).toLocaleDateString('es-VE', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              {toast.booking.plan_name && (
                <p className="text-xs text-teal-600 font-semibold mt-1">
                  {toast.booking.plan_name}
                  {toast.booking.plan_price ? ` · ${fmtMoney(toast.booking.plan_price)}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
