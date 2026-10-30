'use client';

/**
 * ReleaseNotesModal — carousel of unseen release notes for doctors.
 *
 * Rules:
 * - Notes ordered newest first (up to 5).
 * - "Entendido" on last slide (or always) → POST /api/doctor/release-notes/seen → close.
 * - Closing via X / Escape does NOT mark notes as seen — they reappear next visit.
 * - Plain text rendering: newlines → white-space: pre-line; "- " list lines → <ul><li>.
 * - Never dangerouslySetInnerHTML.
 * - Image: aspect-ratio box to prevent layout shift.
 * - Accessible: role=dialog, aria-modal, aria-labelledby, focus trap, return focus on close.
 *
 * The component can be used in two modes:
 * - Normal (readOnly=false): loads notes from /api/doctor/release-notes/unseen, posts seen.
 * - Preview (readOnly=true): receives notes as prop, no fetch, no POST.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReleaseNoteSlide {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  publishedAt: string;
}

interface ReleaseNotesModalProps {
  onClose: () => void;
  /** Preview mode: notes are passed in, no fetch, no mark-seen POST. */
  notes?: ReleaseNoteSlide[];
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCaracasDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-VE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Caracas',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Renders plain text body as React nodes:
 * - Lines starting with "- " become <ul><li> items.
 * - Other lines and newlines use white-space: pre-line on the container.
 * - Never dangerouslySetInnerHTML.
 */
function ReleaseNoteBody({ body }: { body: string }) {
  const lines = body.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="list-disc list-inside space-y-1 my-2">
        {listItems.map((item, i) => (
          <li key={i} className="text-slate-700">
            {item}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  lines.forEach((line, i) => {
    if (line.startsWith('- ')) {
      listItems.push(line.slice(2));
    } else {
      flushList();
      nodes.push(
        <span key={i} style={{ whiteSpace: 'pre-line' }}>
          {line}
          {i < lines.length - 1 ? '\n' : ''}
        </span>,
      );
    }
  });
  flushList();

  return <div className="text-sm text-slate-700 leading-relaxed">{nodes}</div>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReleaseNotesModal({
  onClose,
  notes: notesProp,
  readOnly = false,
}: ReleaseNotesModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState<ReleaseNoteSlide[]>(notesProp ?? []);
  const [loading, setLoading] = useState(!notesProp);
  const [loadError, setLoadError] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [marking, setMarking] = useState(false);

  // Return focus to the element that opened the modal on close.
  const [returnTo] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );

  // Load unseen notes when not in preview mode.
  useEffect(() => {
    if (readOnly || notesProp) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/doctor/release-notes/unseen', { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) {
          setLoadError('No se pudieron cargar las novedades.');
          setLoading(false);
          return;
        }
        const json = (await res.json()) as { data?: ReleaseNoteSlide[] };
        if (!cancelled) {
          setNotes(json.data ?? []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Error de red al cargar las novedades.');
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [readOnly, notesProp]);

  // Return focus on unmount.
  useEffect(() => {
    return () => {
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [returnTo]);

  // Focus trap + Escape to close.
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

  const handleMarkSeen = useCallback(async () => {
    if (readOnly) {
      onClose();
      return;
    }
    setMarking(true);
    try {
      await fetch('/api/doctor/release-notes/seen', { method: 'POST', cache: 'no-store' });
    } catch {
      // Swallow — modal closes anyway; notes reappear next visit if failed.
    } finally {
      setMarking(false);
      onClose();
    }
  }, [readOnly, onClose]);

  const total = notes.length;
  const currentNote = notes[currentIndex];
  const isLast = currentIndex === total - 1;

  const titleId = 'release-notes-modal-title';

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
        aria-labelledby={titleId}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex-shrink-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-600 mb-1">
            Novedades de Delta Salud
          </p>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
              Cargando novedades...
            </div>
          ) : loadError ? (
            <div className="flex items-center justify-center py-16 text-red-500 text-sm px-6 text-center">
              {loadError}
            </div>
          ) : total === 0 ? (
            <div className="flex items-center justify-center py-16 text-slate-500 text-sm px-6 text-center">
              No hay novedades nuevas por ahora.
            </div>
          ) : (
            currentNote && (
              <div className="px-6 py-5 space-y-4">
                {/* Image */}
                {currentNote.imageUrl && (
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-100">
                    <Image
                      src={currentNote.imageUrl}
                      alt={currentNote.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 512px) 100vw, 512px"
                    />
                  </div>
                )}

                {/* Date + title */}
                <div>
                  <time className="text-xs text-slate-400 font-medium">
                    {formatCaracasDate(currentNote.publishedAt)}
                  </time>
                  <h2 id={titleId} className="text-lg font-bold text-slate-800 mt-1 leading-snug">
                    {currentNote.title}
                  </h2>
                </div>

                {/* Body */}
                <ReleaseNoteBody body={currentNote.body} />
              </div>
            )
          )}
        </div>

        {/* Footer: pagination dots + navigation */}
        {!loading && !loadError && total > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
            {/* Dots */}
            {total > 1 && (
              <div
                className="flex items-center justify-center gap-1.5 mb-4"
                aria-label="Progreso de novedades"
              >
                {Array.from({ length: total }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentIndex(i)}
                    aria-label={`Novedad ${i + 1} de ${total}`}
                    aria-current={i === currentIndex ? 'true' : undefined}
                    className={`h-1.5 rounded-full transition-all ${
                      i === currentIndex
                        ? 'bg-teal-500 w-5'
                        : 'bg-slate-200 w-1.5 hover:bg-slate-300'
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center gap-2">
              {total > 1 && currentIndex > 0 && (
                <button
                  onClick={() => setCurrentIndex((i) => i - 1)}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </button>
              )}

              {total > 1 && !isLast && (
                <button
                  onClick={() => setCurrentIndex((i) => i + 1)}
                  className="flex-1 flex items-center justify-center gap-1 px-4 py-2 text-sm font-medium bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                >
                  Siguiente
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {(isLast || total === 1) && (
                <button
                  onClick={() => {
                    void handleMarkSeen();
                  }}
                  disabled={marking}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-60 transition-colors"
                >
                  {marking ? (
                    'Guardando...'
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Entendido
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Empty/error state footer */}
        {!loading && (loadError || total === 0) && (
          <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-sm font-medium bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
