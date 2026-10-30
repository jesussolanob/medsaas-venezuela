'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  X,
  Phone,
  MessageCircle,
  Mail,
  PhoneCall,
  CheckCircle2,
  Loader2,
  Send,
} from 'lucide-react';
import { SUPPORT_WHATSAPP_NUMBER, SUPPORT_WHATSAPP_DISPLAY } from '@/lib/support-contact';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SupportHours {
  days: number[];
  start: string;
  end: string;
  timezone: string;
}

interface SupportInfo {
  whatsapp: string;
  callNowAvailable: boolean;
  supportHours: SupportHours;
}

interface CurrentRequest {
  id: string;
  channel: string;
  message: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

type Channel = 'call_now' | 'whatsapp' | 'call' | 'email';

interface ContactarYaModalProps {
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Channel options
// ---------------------------------------------------------------------------

const CHANNEL_OPTIONS: { key: Channel; label: string; icon: LucideIcon; desc: string }[] = [
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    icon: MessageCircle,
    desc: 'Te respondemos por mensaje',
  },
  { key: 'call', label: 'Llamada', icon: Phone, desc: 'Te llamamos en el horario acordado' },
  { key: 'email', label: 'Correo', icon: Mail, desc: 'Te respondemos a tu correo registrado' },
];

const CHANNEL_LABELS: Record<Channel, string> = {
  call_now: 'Llámame ya',
  whatsapp: 'WhatsApp',
  call: 'Llamada',
  email: 'Correo',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCaracasDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-VE', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Caracas',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContactarYaModal({ onClose }: ContactarYaModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const [supportInfo, setSupportInfo] = useState<SupportInfo | null>(null);
  const [currentRequest, setCurrentRequest] = useState<CurrentRequest | null | undefined>(
    undefined,
  ); // undefined = loading, null = none
  const [loadError, setLoadError] = useState('');

  const [selectedChannel, setSelectedChannel] = useState<Channel>('whatsapp');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<CurrentRequest | null>(null);

  // Return focus to the element that opened the modal
  const [returnTo] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );

  // Load support info and current request on open
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [infoRes, currentRes] = await Promise.all([
          fetch('/api/doctor/support-info', { cache: 'no-store' }),
          fetch('/api/doctor/contact-requests/current', { cache: 'no-store' }),
        ]);
        if (cancelled) return;

        if (infoRes.ok) {
          const json = (await infoRes.json()) as { data?: SupportInfo };
          if (!cancelled && json.data) setSupportInfo(json.data);
        } else {
          if (!cancelled) setLoadError('No se pudo cargar la información de soporte.');
        }

        if (currentRes.ok) {
          const json = (await currentRes.json()) as { data?: CurrentRequest | null };
          if (!cancelled) setCurrentRequest(json.data ?? null);
        } else {
          if (!cancelled) setCurrentRequest(null);
        }
      } catch {
        if (!cancelled) setLoadError('Error de red al cargar los datos.');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Return focus on unmount
  useEffect(() => {
    return () => {
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [returnTo]);

  // Focus trap
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable: HTMLElement[] = (
        Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), ' +
              'select:not([disabled]), textarea:not([disabled]), ' +
              '[tabindex]:not([tabindex="-1"])',
          ),
        ) as HTMLElement[]
      ).filter((el: HTMLElement) => el.offsetParent !== null);
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

  const handleSubmit = useCallback(
    async (channel: Channel) => {
      setSubmitting(true);
      setSubmitError('');
      try {
        const res = await fetch('/api/doctor/contact-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, message: message.trim() || null }),
        });
        const json = (await res.json()) as {
          data?: CurrentRequest;
          error?: string;
          code?: string;
        };
        if (!res.ok) {
          setSubmitError(json.error ?? 'Error al enviar la solicitud.');
          return;
        }
        setSubmittedRequest(json.data ?? null);
        setSubmitted(true);
      } catch {
        setSubmitError('Error de red. Inténtalo de nuevo.');
      } finally {
        setSubmitting(false);
      }
    },
    [message],
  );

  const waNumber = supportInfo?.whatsapp?.replace(/\D/g, '') || SUPPORT_WHATSAPP_NUMBER;

  const isLoading = supportInfo === null && currentRequest === undefined && !loadError;
  const hasPending =
    currentRequest !== undefined && currentRequest !== null && currentRequest.status === 'pending';

  // Promise text based on channel and schedule
  function getPromiseText(channel: Channel): string {
    if (channel === 'call_now') return 'Te llamamos en los próximos 15 minutos.';
    if (supportInfo?.callNowAvailable) return 'Te contactaremos en menos de 1 hora.';
    return 'Te contactamos al iniciar nuestro horario de atención (lunes a sábado, 8:00 a. m.).';
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(15,23,42,0.55)' }}
      onClick={(e: { target: EventTarget | null; currentTarget: EventTarget | null }) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contactar-ya-title"
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header gradient */}
        <div className="g-bg px-6 py-5 flex items-start justify-between gap-3">
          <div>
            <h2 id="contactar-ya-title" className="text-lg font-bold text-white">
              ¿Cómo te contactamos?
            </h2>
            <p className="text-sm text-white/80 mt-0.5">
              El equipo de Delta Salud está aquí para ayudarte.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="shrink-0 p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Cargando…</span>
            </div>
          )}

          {/* Error loading */}
          {loadError && <p className="text-sm text-red-600 text-center py-4">{loadError}</p>}

          {/* Success state */}
          {submitted && submittedRequest && (
            <div className="text-center space-y-3 py-4">
              <div className="flex items-center justify-center w-14 h-14 bg-teal-50 rounded-full mx-auto">
                <CheckCircle2 className="w-7 h-7 text-teal-500" />
              </div>
              <p className="text-lg font-bold text-slate-900">Listo, te contactaremos pronto</p>
              <p className="text-sm text-slate-500">
                {getPromiseText(submittedRequest.channel as Channel)}
              </p>
              <p className="text-xs text-slate-400">
                Canal:{' '}
                <span className="font-semibold text-slate-600">
                  {CHANNEL_LABELS[submittedRequest.channel as Channel] ?? submittedRequest.channel}
                </span>
              </p>
              {/* WhatsApp direct link as secondary option */}
              <a
                href={`https://wa.me/${waNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:underline"
              >
                <MessageCircle className="w-4 h-4" />
                Escribir por WhatsApp ahora
              </a>
            </div>
          )}

          {/* Main form */}
          {!isLoading && !loadError && !submitted && supportInfo && (
            <>
              {/* Pending request notice */}
              {hasPending && currentRequest && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  Ya tenemos tu solicitud del{' '}
                  <span className="font-semibold">
                    {formatCaracasDate(currentRequest.createdAt)}
                  </span>
                  . Puedes actualizarla enviando una nueva.
                </div>
              )}

              {/* Primary option: "Llámame ya" */}
              {supportInfo.callNowAvailable && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmit('call_now')}
                  className="w-full g-bg text-white rounded-xl px-5 py-4 text-left transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2"
                >
                  <div className="flex items-center gap-3">
                    {submitting ? (
                      <Loader2 className="w-6 h-6 shrink-0 animate-spin" />
                    ) : (
                      <PhoneCall className="w-6 h-6 shrink-0" />
                    )}
                    <div>
                      <p className="font-bold text-base">Llámame ya</p>
                      <p className="text-sm text-white/80">
                        Te llamamos en los próximos 15 minutos
                      </p>
                    </div>
                  </div>
                </button>
              )}

              {/* Outside hours notice */}
              {!supportInfo.callNowAvailable && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
                  <p className="font-semibold text-slate-700 mb-0.5">
                    Fuera del horario de atención
                  </p>
                  <p>Recibirás respuesta al iniciar nuestro horario: lunes a sábado, 8:00 a. m.</p>
                </div>
              )}

              {/* Channel selector */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Elige cómo contactarte
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {CHANNEL_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isActive = selectedChannel === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setSelectedChannel(opt.key)}
                        className={[
                          'flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                          isActive
                            ? 'border-teal-400 bg-teal-50 text-teal-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-slate-50',
                        ].join(' ')}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-xs font-semibold">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional message */}
              <div>
                <label
                  htmlFor="contact-message"
                  className="text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  Mensaje adicional{' '}
                  <span className="normal-case font-normal text-slate-400">(opcional)</span>
                </label>
                <textarea
                  id="contact-message"
                  rows={3}
                  maxLength={500}
                  value={message}
                  onChange={(e: { target: { value: string } }) => setMessage(e.target.value)}
                  placeholder="Cuéntanos brevemente en qué podemos ayudarte…"
                  className="mt-1.5 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-shadow"
                />
                <p className="text-xs text-slate-400 text-right mt-0.5">{message.length}/500</p>
              </div>

              {/* Submit error */}
              {submitError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {submitError}
                </p>
              )}

              {/* Promise text */}
              <p className="text-xs text-slate-400 text-center">
                {getPromiseText(selectedChannel)}
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        {!isLoading && !loadError && !submitted && supportInfo && (
          <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit(selectedChannel)}
              className="w-full sm:flex-1 bg-teal-500 text-white font-semibold rounded-xl px-5 py-3 hover:bg-teal-600 disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitting ? 'Enviando…' : 'Enviar solicitud'}
            </button>
            <a
              href={`https://wa.me/${waNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-teal-600 hover:underline whitespace-nowrap flex items-center gap-1"
            >
              <MessageCircle className="w-4 h-4" />
              {SUPPORT_WHATSAPP_DISPLAY}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
