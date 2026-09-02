'use client';

/**
 * PublicQuoteClient
 *
 * Renders the recipient-facing view of a cotización.
 * No auth required — this page is shared via a link.
 * The PDF download navigates to the server PDF route.
 */

import { Download, CheckCircle, Clock } from 'lucide-react';
import type { PublicQuoteData } from './page';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  expired: 'Vencido',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-sky-50 text-sky-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-600',
  expired: 'bg-amber-50 text-amber-700',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const dateStr = iso.includes('T') ? (iso.split('T')[0] ?? iso) : iso;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return '—';
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function usdFmt(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  token: string;
  quote: PublicQuoteData;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PublicQuoteClient({ token, quote }: Props) {
  const primaryColor = quote.templateConfig?.primaryColor ?? '#0891b2';
  const headerText = quote.templateConfig?.headerText ?? quote.doctor.fullName;

  // Coerce NUMERIC fields — Postgres serialises NUMERIC as strings; the
  // public endpoint may not go through the same ORM coercion as the doctor API.
  const subtotalUsd = Number(quote.subtotalUsd);
  const discountUsd = Number(quote.discountUsd);
  const totalUsd = Number(quote.totalUsd);
  const bcvRate = quote.bcvRate != null ? Number(quote.bcvRate) : null;
  const totalBs = quote.totalBs != null ? Number(quote.totalBs) : null;

  function downloadPdf() {
    window.location.href = `/api/quotes/${token}/pdf`;
  }

  const isExpiredOrRejected = quote.status === 'expired' || quote.status === 'rejected';

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header branding */}
        <div
          className="rounded-2xl px-6 py-5 text-white"
          style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, #0369a1 100%)` }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">
                Presupuesto médico
              </p>
              <h1 className="text-2xl font-black font-mono tracking-tight">{quote.quoteNumber}</h1>
              {headerText && <p className="text-sm opacity-90 mt-2 font-semibold">{headerText}</p>}
              {quote.doctor.specialty && (
                <p className="text-xs opacity-70 mt-0.5">{quote.doctor.specialty}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[quote.status]}`}
              >
                {STATUS_LABELS[quote.status] ?? quote.status}
              </span>
            </div>
          </div>
        </div>

        {/* Status notice */}
        {quote.status === 'accepted' && (
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold text-emerald-700">
              Este presupuesto fue aceptado. Comunicate con el especialista para coordinar el pago.
            </p>
          </div>
        )}
        {isExpiredOrRejected && (
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm font-semibold text-amber-700">
              {quote.status === 'expired'
                ? 'Este presupuesto ya venció. Solicitá una nueva cotización.'
                : 'Este presupuesto fue rechazado.'}
            </p>
          </div>
        )}

        {/* Meta */}
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 grid sm:grid-cols-2 gap-3 text-sm">
          {quote.recipient_name && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">
                Destinatario
              </p>
              <p className="text-slate-700 font-semibold">{quote.recipient_name}</p>
            </div>
          )}
          {quote.validUntil && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <p className="text-slate-600">
                Válido hasta:{' '}
                <strong className="text-slate-800">{formatDate(quote.validUntil)}</strong>
              </p>
            </div>
          )}
        </div>

        {/* Items table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-700">Servicios y productos</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    Descripción
                  </th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-16">
                    Cant.
                  </th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-28">
                    Precio unit.
                  </th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-28">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {quote.items
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{it.name}</p>
                        {it.description && (
                          <p className="text-xs text-slate-400 mt-0.5">{it.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                        {Number(it.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                        {usdFmt(Number(it.unitPriceUsd))}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">
                        {usdFmt(Number(it.amountUsd))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
            <div className="space-y-1.5 min-w-48">
              <div className="flex items-center justify-between gap-8 text-sm text-slate-500">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-700 tabular-nums">
                  {usdFmt(subtotalUsd)}
                </span>
              </div>
              {discountUsd > 0 && (
                <div className="flex items-center justify-between gap-8 text-sm text-slate-500">
                  <span>Descuento</span>
                  <span className="text-red-500 tabular-nums">-{usdFmt(discountUsd)}</span>
                </div>
              )}
              <div
                className="flex items-center justify-between gap-8 text-base font-bold pt-1.5 border-t border-slate-200"
                style={{ color: primaryColor }}
              >
                <span>Total</span>
                <span className="tabular-nums">{usdFmt(totalUsd)}</span>
              </div>
              {totalBs && bcvRate && (
                <div className="flex items-center justify-between gap-8 text-xs text-slate-400">
                  <span>En bolívares (tasa {bcvRate.toFixed(2)})</span>
                  <span className="tabular-nums">
                    Bs.{' '}
                    {totalBs.toLocaleString('es-VE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-bold text-slate-700 mb-2">Condiciones y notas</h2>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}

        {/* Download CTA */}
        <div className="flex justify-center pb-4">
          <button
            type="button"
            onClick={downloadPdf}
            className="flex items-center gap-2 px-6 py-3 text-sm font-bold text-white rounded-xl shadow-md transition-opacity hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, #0369a1 100%)` }}
          >
            <Download className="w-4 h-4" />
            Descargar PDF
          </button>
        </div>

        {/* Footer branding */}
        <div className="text-center pb-6">
          <p className="text-xs text-slate-400">
            Presupuesto generado con{' '}
            <span className="font-semibold" style={{ color: primaryColor }}>
              Delta Salud
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
