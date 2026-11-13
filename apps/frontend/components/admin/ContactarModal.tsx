'use client';

/**
 * Shared ContactarModal — shows contact info for a doctor.
 *
 * Extracted from /admin/subscriptions/page.tsx (2026-10-30) so it can be
 * reused by other admin pages (e.g. contact-requests) without duplicating
 * the implementation.
 *
 * Behavior is IDENTICAL to the original inline version. Do not change it
 * without also checking all call sites.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Loader2, CheckCircle2, Copy, Mail, Phone, MessageCircle } from 'lucide-react';
import { normalizePhoneIntl } from '@/lib/phone-utils';

interface DoctorContact {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  cedula: string | null;
}

interface ContactarModalProps {
  doctorId: string;
  onClose: () => void;
}

export function ContactarModal({ doctorId, onClose }: ContactarModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [contact, setContact] = useState<DoctorContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Botón que abrió el modal. Se captura en el PRIMER RENDER (inicializador de
  // useState), no en un efecto: el autoFocus del botón "Cerrar" se aplica en el
  // commit, antes de que corran los efectos, así que dentro de un useEffect
  // `document.activeElement` ya era "Cerrar" y el foco nunca volvía al
  // "Contactar" (verificado en staging, 22/10).
  const [returnTo] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );

  // Return focus to the element that had it before the modal opened.
  useEffect(() => {
    return () => {
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [returnTo]);

  // Tab / Shift+Tab focus trap
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/doctor-details?id=${doctorId}`);
        const body = (await res.json()) as {
          error?: string;
          profile?: { full_name?: string; email?: string; phone?: string; cedula?: string };
        };
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error ?? 'Error al cargar detalles');
        setContact({
          id: doctorId,
          fullName: body.profile?.full_name ?? '—',
          email: body.profile?.email ?? '',
          phone: body.profile?.phone ?? null,
          cedula: body.profile?.cedula ?? null,
        });
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar detalles');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [doctorId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copyToClipboard(value: string, field: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // fallback — ignore
    }
  }

  const waNumber = contact?.phone ? normalizePhoneIntl(contact.phone) || null : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onClick={(e: { target: EventTarget | null; currentTarget: EventTarget | null }) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contactar-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 id="contactar-title" className="text-base font-bold text-slate-900">
            Información de contacto
          </h2>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Cargando datos…</span>
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : contact ? (
            <div className="space-y-4">
              {[
                { key: 'name', label: 'Nombre', value: contact.fullName },
                {
                  key: 'cedula',
                  label: 'Identificación',
                  value: contact.cedula ?? 'No registrado',
                },
                { key: 'email', label: 'Correo', value: contact.email || 'No registrado' },
                {
                  key: 'phone',
                  label: 'Teléfono',
                  value: contact.phone || null,
                  hint: !contact.phone ? 'El especialista aún no cargó su teléfono' : undefined,
                },
              ].map(({ key, label, value, hint }) => (
                <div key={key} className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                      {label}
                    </div>
                    {value ? (
                      <div className="text-sm font-medium text-slate-800 break-all">{value}</div>
                    ) : (
                      <div className="text-sm text-slate-400 italic">{hint ?? 'No registrado'}</div>
                    )}
                  </div>
                  {value && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(value, key)}
                      className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                      title={`Copiar ${label.toLowerCase()}`}
                    >
                      {copiedField === key ? (
                        <CheckCircle2 className="w-4 h-4 text-teal-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              ))}
              {copiedField && (
                <p className="text-xs text-teal-600 font-medium">Copiado al portapapeles</p>
              )}
            </div>
          ) : null}
        </div>

        {/* Actions footer */}
        {contact && !loading && !error && (
          <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2">
            {contact.email && /^[^\s&#?'<>\r\n]+@[^\s&#?'<>\r\n]+$/.test(contact.email) && (
              <a
                href={`mailto:${contact.email}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                Escribir correo
              </a>
            )}
            {waNumber && (
              <a
                href={`https://wa.me/${waNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp
              </a>
            )}
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                Llamar
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
