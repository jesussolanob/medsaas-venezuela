'use client';

/**
 * PublicQuoteClient
 *
 * Renders the recipient-facing view of a cotización.
 * No auth required — this page is shared via a link.
 * The PDF download navigates to the server PDF route.
 */

import { useState } from 'react';
import { Download, CheckCircle, XCircle, Clock, Calendar } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { PublicQuoteData } from './page';
import { useBcvRate } from '@/lib/useBcvRate';

type QuoteStatus = PublicQuoteData['status'];

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

/**
 * Símbolo y código de la moneda en la que trabaja el especialista.
 *
 * La vista pública mostraba SIEMPRE "$". Hay especialistas que trabajan en euros
 * y a sus pacientes se les presentaba el presupuesto en una moneda ajena. El
 * booking público ya respetaba esta preferencia; esta pantalla no.
 */
function currencyOf(mode: string | null | undefined): { symbol: string; code: string } {
  return mode === 'eur_bcv' ? { symbol: '€', code: 'EUR' } : { symbol: '$', code: 'USD' };
}

function moneyFmt(n: number, symbol: string): string {
  return `${symbol}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const KIND_BADGE: Record<'service' | 'product' | 'manual', { label: string; className: string }> = {
  service: { label: 'S', className: 'bg-teal-50 text-teal-700' },
  product: { label: 'P', className: 'bg-violet-50 text-violet-700' },
  manual: { label: 'M', className: 'bg-slate-200 text-slate-700' },
};

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

export default function PublicQuoteClient({ token, quote: initialQuote }: Props) {
  // Local status override once the recipient responds — the initial fetch
  // (page.tsx) is server-side and won't re-run, so the badge/notice/buttons
  // must reflect the just-submitted decision without a page reload.
  const [status, setStatus] = useState<QuoteStatus>(initialQuote.status);
  const [pendingAction, setPendingAction] = useState<'accepted' | 'rejected' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const quote = initialQuote;
  const primaryColor = quote.templateConfig?.primaryColor ?? '#0891b2';
  const headerText = quote.templateConfig?.headerText ?? quote.doctor.fullName;

  // Coerce NUMERIC fields — Postgres serialises NUMERIC as strings; the
  // public endpoint may not go through the same ORM coercion as the doctor API.
  const subtotalUsd = Number(quote.subtotalUsd);
  const discountUsd = Number(quote.discountUsd);
  const totalUsd = Number(quote.totalUsd);
  // Moneda del especialista: sin esto la pantalla mostraba siempre "$", incluso
  // a los pacientes de un especialista que trabaja en euros.
  const currency = currencyOf(quote.doctor.currencyMode);
  const moneyFmt2 = (n: number) => moneyFmt(n, currency.symbol);

  /*
   * Los bolívares se recalculan con la tasa VIVA del BCV, no con la que quedó
   * congelada al emitir el presupuesto.
   *
   * Así funciona el negocio en Venezuela: lo que se pacta y queda fijo es el
   * monto en divisa; los bolívares son una conversión referencial que cambia
   * todos los días. Mostrar la tasa del día de emisión hacía que un presupuesto
   * de hace dos semanas exhibiera un monto en Bs que ya no existe, y el paciente
   * se presentaba a pagar con la cifra equivocada.
   *
   * `quote.bcvRate` y `quote.totalBs` se conservan en la base como registro
   * histórico de la emisión, pero NO se muestran.
   */
  const { rate: liveRate } = useBcvRate({
    mode: quote.doctor.currencyMode ?? undefined,
  });
  const bcvRate = liveRate;
  const totalBs = liveRate != null ? Math.round(totalUsd * liveRate * 100) / 100 : null;

  function downloadPdf() {
    window.location.href = `/api/quotes/${token}/pdf`;
  }

  async function submitStatus(next: 'accepted' | 'rejected'): Promise<void> {
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/quotes/${token}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const body = (await res.json().catch(() => null)) as
        | { success: true; data: { status: QuoteStatus } }
        | { error: string }
        | null;
      if (!res.ok || !body || !('success' in body)) {
        const message =
          (body && 'error' in body && body.error) ||
          'No se pudo registrar tu respuesta. Intentá de nuevo.';
        // Close the confirm dialog so the error is visible instead of hidden
        // behind it — the Aceptar/Rechazar buttons stay in place to retry.
        setPendingAction(null);
        setActionError(message);
        return;
      }
      setStatus(body.data.status);
      setPendingAction(null);
    } catch {
      setPendingAction(null);
      setActionError('No se pudo conectar con el servidor. Intentá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

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
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[status]}`}
              >
                {STATUS_LABELS[status] ?? status}
              </span>
            </div>
          </div>
        </div>

        {/* Status notice */}
        {status === 'accepted' && (
          <div className="flex items-start gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-semibold text-emerald-700">
                Aceptaste este presupuesto. Comunicate con el especialista para coordinar el pago.
              </p>
              <a
                href={`/book/${quote.doctor.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white rounded-lg transition-opacity hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, #0369a1 100%)` }}
              >
                <Calendar className="w-3.5 h-3.5" />
                Agendá tu cita
              </a>
            </div>
          </div>
        )}
        {status === 'rejected' && (
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl">
            <XCircle className="w-5 h-5 text-slate-500 shrink-0" />
            <p className="text-sm font-semibold text-slate-600">
              Registramos tu respuesta: rechazaste este presupuesto.
            </p>
          </div>
        )}
        {status === 'expired' && (
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm font-semibold text-amber-700">
              Este presupuesto ya venció. Solicitá un nuevo presupuesto.
            </p>
          </div>
        )}

        {/* Accept / reject actions — only while the quote is still 'sent' */}
        {status === 'sent' && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-700">
              ¿Qué querés hacer con este presupuesto?
            </p>
            {actionError && <p className="text-sm text-red-500">{actionError}</p>}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setPendingAction('accepted')}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
              >
                <CheckCircle className="w-4 h-4" />
                Aceptar presupuesto
              </button>
              <button
                type="button"
                onClick={() => setPendingAction('rejected')}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-60"
              >
                <XCircle className="w-4 h-4" />
                Rechazar
              </button>
            </div>
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
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-8">
                    Tipo
                  </th>
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
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${KIND_BADGE[it.kind].className}`}
                        >
                          {KIND_BADGE[it.kind].label}
                        </span>
                      </td>
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
                        {moneyFmt2(Number(it.unitPriceUsd))}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">
                        {moneyFmt2(Number(it.amountUsd))}
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
                  {moneyFmt2(subtotalUsd)}
                </span>
              </div>
              {discountUsd > 0 && (
                <div className="flex items-center justify-between gap-8 text-sm text-slate-500">
                  <span>Descuento</span>
                  <span className="text-red-500 tabular-nums">-{moneyFmt2(discountUsd)}</span>
                </div>
              )}
              <div
                className="flex items-center justify-between gap-8 text-base font-bold pt-1.5 border-t border-slate-200"
                style={{ color: primaryColor }}
              >
                <span>Total</span>
                <span className="tabular-nums">{moneyFmt2(totalUsd)}</span>
              </div>
              {totalBs && bcvRate && (
                <>
                  <div className="flex items-center justify-between gap-8 text-xs text-slate-500">
                    <span>Referencia en bolívares</span>
                    <span className="tabular-nums">
                      Bs.{' '}
                      {totalBs.toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  {/*
                    La tasa y el monto en bolívares se CONGELAN al emitir el
                    presupuesto (send-quote.use-case.ts) y no se recalculan después.
                    Decir "a la tasa del día" sería mentir: un presupuesto de hace
                    dos semanas mostraría una tasa vieja y el paciente creería que
                    ese es el monto que va a pagar hoy. Se aclara la fecha de la
                    tasa y que el monto puede variar al momento de pagar.
                  */}
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    Monto referencial indexado a la tasa oficial del BCV del día: Bs.{' '}
                    {bcvRate.toFixed(2)} por {currency.code}. El precio acordado es en{' '}
                    {currency.code}; el equivalente en bolívares se actualiza con la tasa vigente al
                    momento del pago.
                  </p>
                </>
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

      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction === 'accepted'
            ? '¿Aceptar este presupuesto?'
            : '¿Rechazar este presupuesto?'
        }
        message={
          pendingAction === 'accepted'
            ? 'Le avisaremos al especialista que aceptaste. Esta decisión no se puede deshacer desde acá.'
            : 'Le avisaremos al especialista que rechazaste el presupuesto. Esta decisión no se puede deshacer desde acá.'
        }
        confirmLabel={pendingAction === 'accepted' ? 'Sí, aceptar' : 'Sí, rechazar'}
        cancelLabel="Volver"
        variant={pendingAction === 'rejected' ? 'danger' : 'default'}
        loading={submitting}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (pendingAction) void submitStatus(pendingAction);
        }}
      />
    </div>
  );
}
