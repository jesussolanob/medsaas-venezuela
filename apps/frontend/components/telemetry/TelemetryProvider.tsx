'use client';

/**
 * TelemetryProvider — global low-touch telemetry for the doctor portal.
 *
 * Captures the doctor's journey (route navigations + delegated click events)
 * WITHOUT requiring per-screen instrumentation. Accumulates events in an
 * in-memory buffer (mirrored to localStorage for resilience) and flushes them
 * in batches to /api/telemetry/session.
 *
 * Flush triggers:
 *   - setInterval every 15 s
 *   - document visibilitychange (hidden) → sendBeacon
 *   - beforeunload → sendBeacon
 *   - window event "delta:telemetry-end" (fired by logout) → sendBeacon + cleanup
 *
 * This component renders no UI. It must be mounted once inside the
 * authenticated doctor layout (after the onboarding gate passes).
 *
 * Privacy rules enforced here:
 *   - Click capture skips <input>, <textarea>, <select> targets (no PII from values)
 *   - Labels are capped at 60 chars and whitespace-collapsed
 *   - No console.log in production
 */

import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SID_KEY = 'delta_telemetry_sid';
const BUF_KEY = 'delta_telemetry_buf';
const FLUSH_INTERVAL_MS = 15_000;
const MAX_LABEL_LENGTH = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TelemetryEvent {
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Storage helpers (all guarded — SSR / private-browse safe)
// ---------------------------------------------------------------------------

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(SID_KEY, id);
    return id;
  } catch {
    // sessionStorage unavailable (e.g. private mode with strict settings)
    return crypto.randomUUID();
  }
}

function clearSessionId(): void {
  try {
    sessionStorage.removeItem(SID_KEY);
  } catch {
    // Intentionally swallowed: cleanup failure must not surface to the user.
  }
}

function readBufferFromStorage(): TelemetryEvent[] {
  try {
    const raw = localStorage.getItem(BUF_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TelemetryEvent[];
  } catch {
    return [];
  }
}

function writeBufferToStorage(events: TelemetryEvent[]): void {
  try {
    localStorage.setItem(BUF_KEY, JSON.stringify(events));
  } catch {
    // Intentionally swallowed: storage quota or unavailability is non-fatal.
  }
}

function clearBufferFromStorage(): void {
  try {
    localStorage.removeItem(BUF_KEY);
  } catch {
    // Intentionally swallowed.
  }
}

// ---------------------------------------------------------------------------
// Click label extractor
// ---------------------------------------------------------------------------

function extractClickLabel(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;

  // Never capture text from form fields — avoids PII leakage.
  const interactive = target.closest('button, a, [data-track]');
  if (!interactive) return null;

  // Prefer explicit data-track attribute, then aria-label, then textContent.
  const label =
    (interactive as HTMLElement).dataset['track'] ??
    interactive.getAttribute('aria-label') ??
    interactive.textContent ??
    '';

  // Collapse whitespace, trim, and cap length.
  return label.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH) || null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TelemetryProvider(): null {
  const pathname = usePathname();

  // Stable refs so callbacks can access mutable state without stale closures.
  const sessionIdRef = useRef<string>('');
  const bufferRef = useRef<TelemetryEvent[]>([]);

  // ---------------------------------------------------------------------------
  // Initialise on mount — read persisted buffer + create/reuse session id
  // ---------------------------------------------------------------------------
  useEffect(() => {
    try {
      sessionIdRef.current = getOrCreateSessionId();
      bufferRef.current = readBufferFromStorage();
    } catch {
      // Telemetry init failure must never crash the portal.
    }
  }, []);

  // ---------------------------------------------------------------------------
  // pushEvent — adds an event to the in-memory buffer + mirrors to localStorage
  // ---------------------------------------------------------------------------
  const pushEvent = useCallback(
    (
      action: string,
      resourceType: string | null,
      resourceId: string | null,
      metadata: Record<string, unknown> | null = null,
    ): void => {
      try {
        const now = Date.now();
        // Dedup: skip an event identical to the immediately preceding one within
        // 1s — collapses React StrictMode double-effects (dev) and accidental
        // double-fires so the journey stays clean.
        const last = bufferRef.current[bufferRef.current.length - 1];
        if (
          last &&
          last.action === action &&
          last.resource_type === resourceType &&
          last.resource_id === resourceId &&
          now - new Date(last.occurred_at).getTime() < 1000
        ) {
          return;
        }
        const event: TelemetryEvent = {
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          occurred_at: new Date(now).toISOString(),
          metadata,
        };
        bufferRef.current = [...bufferRef.current, event];
        writeBufferToStorage(bufferRef.current);
      } catch {
        // Intentionally swallowed: telemetry must not affect app behaviour.
      }
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // flush — send buffered events to the BFF
  // ---------------------------------------------------------------------------
  const flush = useCallback((ended: boolean, useSendBeacon: boolean): void => {
    try {
      const events = bufferRef.current;
      if (events.length === 0 && !ended) return;

      const sessionId = sessionIdRef.current;
      if (!sessionId) return;

      const payload = JSON.stringify({
        session_id: sessionId,
        events,
        ended,
      });

      if (useSendBeacon) {
        // sendBeacon is fire-and-forget; no response handling.
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/telemetry/session', blob);
        // Clear buffer optimistically — sendBeacon delivery is not guaranteed
        // but retrying on reload would cause duplicates.
        bufferRef.current = [];
        clearBufferFromStorage();
        return;
      }

      // Regular fetch with keepalive so inflight requests survive page transitions.
      const snapshot = events;
      fetch('/api/telemetry/session', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
        .then((res) => {
          if (res.ok) {
            // Only clear the events that were included in this flush.
            bufferRef.current = bufferRef.current.filter((e) => !snapshot.includes(e));
            writeBufferToStorage(bufferRef.current);
          }
          // On non-ok response: retain buffer and retry on next flush cycle.
        })
        .catch(() => {
          // Network failure: retain buffer for next interval.
          // Intentionally swallowed.
        });
    } catch {
      // Defensive wrapper: telemetry flush must never throw to caller.
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Navigate capture — fires on every pathname change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!pathname) return;
    pushEvent('navigate', 'route', pathname);
  }, [pathname, pushEvent]);

  // ---------------------------------------------------------------------------
  // Click capture — single delegated listener on document (capture phase)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function handleClick(event: MouseEvent): void {
      try {
        const label = extractClickLabel(event.target);
        if (!label) return;
        pushEvent('click', 'ui', label);
      } catch {
        // Intentionally swallowed.
      }
    }

    document.addEventListener('click', handleClick, { capture: true });
    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
    };
  }, [pushEvent]);

  // ---------------------------------------------------------------------------
  // Flush triggers: interval + visibility + beforeunload + logout event
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const intervalId = setInterval(() => {
      flush(false, false);
    }, FLUSH_INTERVAL_MS);

    function handleVisibilityChange(): void {
      if (document.visibilityState === 'hidden') {
        flush(false, true);
      }
    }

    function handleBeforeUnload(): void {
      flush(false, true);
    }

    function handleTelemetryEnd(): void {
      flush(true, true);
      // Clean up session identity so the next login starts a fresh session.
      clearSessionId();
      bufferRef.current = [];
      clearBufferFromStorage();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('delta:telemetry-end', handleTelemetryEnd);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('delta:telemetry-end', handleTelemetryEnd);
    };
  }, [flush]);

  // This provider renders no UI.
  return null;
}
