'use client';

/**
 * TermsModal — modal reutilizable para los Términos y Condiciones.
 *
 * Carga el contenido HTML desde /api/legal/terms al abrirse.
 * Cierra con:
 *   - Botón X (header)
 *   - Tecla Escape
 *   - Clic en el backdrop
 *
 * Uso:
 *   <TermsModal open={open} onClose={() => setOpen(false)} />
 */

import { useEffect, useRef, useState } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';

interface TermsData {
  contentHtml: string;
  version: string;
  updatedAt: string;
}

interface TermsResponse {
  success: boolean;
  data: TermsData;
}

interface TermsModalProps {
  open: boolean;
  onClose: () => void;
}

function formatUpdatedAt(rawDate: string): string {
  if (!rawDate) return '';
  try {
    return new Intl.DateTimeFormat('es-VE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(rawDate));
  } catch {
    return rawDate;
  }
}

export default function TermsModal({ open, onClose }: TermsModalProps) {
  const [termsData, setTermsData] = useState<TermsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Fetch on open (only when data is not already loaded)
  useEffect(() => {
    if (!open) return;
    if (termsData !== null) {
      // Already fetched — just reset scroll position
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      return;
    }

    setLoading(true);
    setFetchError(false);

    void fetch('/api/legal/terms')
      .then((r) => r.json() as Promise<TermsResponse>)
      .then((json) => {
        if (json.success) {
          setTermsData(json.data);
        } else {
          setFetchError(true);
        }
      })
      .catch(() => {
        setFetchError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, termsData]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Focus trap: move focus to close button when modal opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    }
  }, [open]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const hasContent = termsData && termsData.contentHtml.trim().length > 0;
  const formattedDate = termsData ? formatUpdatedAt(termsData.updatedAt) : '';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Términos y Condiciones"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl flex flex-col"
        style={{ maxHeight: '85vh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid #E8ECF0' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 leading-tight">
                Términos y Condiciones
              </h2>
              {formattedDate && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Última actualización: {formattedDate}
                </p>
              )}
              {termsData?.version && !termsData.updatedAt && (
                <p className="text-xs text-slate-400 mt-0.5">v{termsData.version}</p>
              )}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Cerrar Términos y Condiciones"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div ref={scrollRef} className="overflow-y-auto flex-1 px-6 py-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
              <p className="text-sm text-slate-500">Cargando términos...</p>
            </div>
          )}

          {!loading && fetchError && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <p className="text-sm font-medium text-slate-700">
                No se pudieron cargar los términos
              </p>
              <p className="text-sm text-slate-500">
                Intenta nuevamente o{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-600 hover:underline"
                >
                  ábrelos en una nueva pestaña
                </a>
                .
              </p>
            </div>
          )}

          {!loading && !fetchError && termsData && (
            <>
              {hasContent ? (
                /* contentHtml es contenido CONFIABLE generado por nosotros */
                <div
                  className="terms-content prose-terms text-slate-700 text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: termsData.contentHtml }}
                />
              ) : (
                /* Fallback cuando backend devuelve datos pero sin HTML */
                <div className="terms-content text-slate-700 text-sm leading-relaxed space-y-4">
                  <p>Al usar Delta Salud aceptas estos términos. Léelos con atención.</p>
                  <section>
                    <h2 className="text-base font-semibold text-slate-900 mt-5 mb-2">
                      1. Servicio
                    </h2>
                    <p>
                      Delta Salud provee una plataforma SaaS para que profesionales de la salud
                      gestionen su práctica médica privada en Venezuela.
                    </p>
                  </section>
                  <section>
                    <h2 className="text-base font-semibold text-slate-900 mt-5 mb-2">
                      2. Responsabilidad médica
                    </h2>
                    <p>
                      Las decisiones clínicas, diagnósticos, tratamientos y prescripciones son
                      responsabilidad exclusiva del profesional médico.
                    </p>
                  </section>
                  <section>
                    <h2 className="text-base font-semibold text-slate-900 mt-5 mb-2">
                      3. Uso aceptable
                    </h2>
                    <p>
                      Está prohibido cargar información falsa, suplantar identidad o usar la
                      plataforma para fines ilegales.
                    </p>
                  </section>
                  <p className="text-xs text-slate-400 mt-6 pt-4 border-t border-slate-100">
                    Para mayor información:{' '}
                    <a
                      href="mailto:hola@deltahealth.tech"
                      className="text-teal-600 hover:underline"
                    >
                      hola@deltahealth.tech
                    </a>
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 shrink-0 flex items-center justify-between gap-4"
          style={{ borderTop: '1px solid #E8ECF0' }}
        >
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {termsData?.version && (
              <span className="font-mono bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">
                v{termsData.version}
              </span>
            )}
            {formattedDate && <span>{formattedDate}</span>}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-500 rounded-lg hover:bg-teal-600 transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>

      <style>{`
        .terms-content h1 { font-size: 1.25rem; font-weight: 700; color: #1E293B; margin-top: 1.5rem; margin-bottom: 0.5rem; }
        .terms-content h2 { font-size: 1rem; font-weight: 600; color: #1E293B; margin-top: 1.25rem; margin-bottom: 0.5rem; }
        .terms-content h3 { font-size: 0.9375rem; font-weight: 600; color: #334155; margin-top: 1rem; margin-bottom: 0.25rem; }
        .terms-content p { margin-bottom: 0.75rem; }
        .terms-content ul, .terms-content ol { padding-left: 1.25rem; margin-bottom: 0.75rem; }
        .terms-content li { margin-bottom: 0.25rem; }
        .terms-content a { color: #0D9488; text-decoration: underline; }
        .terms-content strong { font-weight: 600; }
        .terms-content section { margin-bottom: 0.5rem; }
      `}</style>
    </div>
  );
}
