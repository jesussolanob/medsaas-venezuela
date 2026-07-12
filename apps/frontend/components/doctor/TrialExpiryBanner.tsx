'use client';

/**
 * components/doctor/TrialExpiryBanner.tsx
 *
 * Banner de aviso de vencimiento de prueba gratuita.
 * Solo visible cuando:
 *   - El doctor está en período de trial (is_in_trial === true), Y
 *   - Quedan ≤ 5 días (days_remaining <= 5).
 *
 * Fuente de datos: GET /api/doctor/subscription → state.is_in_trial + state.days_remaining.
 * Montado en el doctor layout; se descarta por sesión con el botón ×.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, AlertTriangle } from 'lucide-react';

interface SubscriptionState {
  is_in_trial: boolean;
  days_remaining: number;
  expires_at: string | null;
}

const DISMISS_KEY = 'delta_trial_banner_dismissed_v1';

export default function TrialExpiryBanner() {
  const [state, setState] = useState<SubscriptionState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check session-level dismissal first to avoid unnecessary fetch.
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') {
        setDismissed(true);
        return;
      }
    } catch {
      // sessionStorage may be unavailable (private mode, etc.) — proceed normally.
    }

    fetch('/api/doctor/subscription', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.state) {
          setState(data.state as SubscriptionState);
        }
      })
      .catch(() => {
        // Silently fail — the banner is non-critical.
      });
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Ignore.
    }
  }

  // Don't render if: dismissed, data not yet loaded, not in trial, or more than 5 days remaining.
  if (dismissed || !state || !state.is_in_trial || state.days_remaining > 5) {
    return null;
  }

  const daysLeft = state.days_remaining;
  const isUrgent = daysLeft <= 1;

  const expiresLabel = state.expires_at
    ? new Intl.DateTimeFormat('es-VE', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(state.expires_at))
    : null;

  const message =
    daysLeft === 0
      ? 'Tu prueba gratis vence hoy.'
      : daysLeft === 1
        ? 'Tu prueba gratis vence mañana.'
        : `Tu prueba gratis vence en ${daysLeft} días${expiresLabel ? ` (${expiresLabel})` : ''}.`;

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 sm:px-6 lg:px-10 py-2.5"
      style={{
        background: isUrgent ? '#FEF2F2' : '#FFFBEB',
        borderBottom: `1px solid ${isUrgent ? '#FECACA' : '#FDE68A'}`,
      }}
    >
      <AlertTriangle
        className="w-4 h-4 shrink-0"
        style={{ color: isUrgent ? '#DC2626' : '#D97706' }}
        aria-hidden="true"
      />
      <p className="flex-1 text-sm font-medium" style={{ color: isUrgent ? '#991B1B' : '#92400E' }}>
        {message}{' '}
        <Link
          href="/doctor/upgrade"
          className="underline font-semibold transition-opacity hover:opacity-80"
          style={{ color: isUrgent ? '#DC2626' : '#B45309' }}
        >
          Suscríbete para no perder acceso.
        </Link>
      </p>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded transition-colors"
        style={{ color: isUrgent ? '#DC2626' : '#92400E' }}
        aria-label="Cerrar aviso de vencimiento"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
