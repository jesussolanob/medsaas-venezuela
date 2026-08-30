'use client';

/**
 * Mis comisiones — portal del vendedor.
 *
 * La primera pregunta del vendedor al entrar es "¿cuánto me deben?".
 * Por eso el total pendiente manda: es lo primero, lo más grande y lo más
 * importante. El detalle por especialista y el historial de pagos acompañan.
 *
 * Reglas de negocio:
 *   - Cada especialista genera hasta DOS comisiones:
 *     · 'signup' ($10) → cuando completa el alta
 *     · 'plan'   ($10 Base o $20 Plus) → la primera vez que pasa a plan pago
 *   - Una comisión está 'pending' o 'paid'. No hay más estados.
 *   - El vendedor no puede hacer nada para cambiar el estado: el admin es quien
 *     paga. Acá solo se informa.
 *   - Los montos se calculan y guardan en USD. El equivalente en Bs se muestra
 *     como referencia usando la tasa del BCV.
 *   - Las comisiones pendientes usan la tasa actual del BCV.
 *   - Los pagos ya recibidos usan la tasa histórica del día del pago.
 *   - Si la tasa del BCV no está disponible, solo se muestra el USD.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  DollarSign,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  TrendingUp,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { fmtDate, PLAN_LABELS } from '../seller-data';

// ---------------------------------------------------------------------------
// Tipos locales (espejo del DTO del backend — camelCase, verificado contra el
// controller. No copiar/pegar tipos a mano: buscar y comparar con el endpoint.)
// ---------------------------------------------------------------------------

interface SellerCommissionDto {
  id: string;
  sellerId: string;
  specialistId: string;
  specialistName: string;
  type: 'signup' | 'plan';
  amountUsd: number;
  planKey: string | null;
  status: 'pending' | 'paid';
  earnedAt: string;
  paymentId: string | null;
  createdAt: string;
}

interface SellerPaymentDto {
  id: string;
  sellerId: string;
  amountUsd: number;
  /** Tasa BCV histórica del día del pago. null → no disponible al registrar. */
  bcvRate: number | null;
  method: string;
  reference: string;
  receiptUrl: string | null;
  notes: string | null;
  paidAt: string;
  createdBy: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers de presentación
// ---------------------------------------------------------------------------

function fmtUsd(amount: number): string {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Formatea bolívares sin decimales. Devuelve string con prefijo "Bs." */
function fmtBs(amountUsd: number, rate: number): string {
  return `Bs. ${(amountUsd * rate).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
}

function tipoLabel(type: 'signup' | 'plan', planKey: string | null): string {
  if (type === 'signup') return 'Por alta completada';
  if (planKey) return `Plan ${PLAN_LABELS[planKey] ?? planKey}`;
  return 'Por plan pago';
}

function tipoAyuda(type: 'signup' | 'plan'): string {
  if (type === 'signup') return 'Se generó cuando el especialista completó su registro.';
  return 'Se generó cuando el especialista pasó a su primer plan pago.';
}

// ---------------------------------------------------------------------------
// Hook de datos
// ---------------------------------------------------------------------------

interface ComisionesData {
  commissions: SellerCommissionDto[];
  payments: SellerPaymentDto[];
  /** Tasa BCV actual para comisiones pendientes. null → no disponible. */
  bcvRate: number | null;
  loading: boolean;
  error: string | null;
}

function useComisionesData(): ComisionesData {
  const [commissions, setCommissions] = useState<SellerCommissionDto[]>([]);
  const [payments, setPayments] = useState<SellerPaymentDto[]>([]);
  const [bcvRate, setBcvRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [comRes, payRes] = await Promise.all([
        fetch('/api/seller/commissions', { cache: 'no-store' }),
        fetch('/api/seller/payments', { cache: 'no-store' }),
      ]);

      if (!comRes.ok) {
        const j = (await comRes.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? 'No se pudieron cargar las comisiones.');
        return;
      }
      if (!payRes.ok) {
        const j = (await payRes.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? 'No se pudo cargar el historial de pagos.');
        return;
      }

      // El BFF de commissions retorna { data: { bcvRate, commissions } }
      const comJson = (await comRes.json()) as {
        data?: { bcvRate?: number | null; commissions?: SellerCommissionDto[] };
      };
      // El BFF de payments retorna { data: SellerPaymentDto[] }
      const payJson = (await payRes.json()) as { data?: SellerPaymentDto[] };

      setBcvRate(comJson.data?.bcvRate ?? null);
      setCommissions(Array.isArray(comJson.data?.commissions) ? comJson.data.commissions : []);
      setPayments(Array.isArray(payJson.data) ? payJson.data : []);
    } catch {
      setError('Error de conexión. Revisá tu red e intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(t);
  }, [cargar]);

  return { commissions, payments, bcvRate, loading, error };
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

/** Fila de una comisión en la tabla de detalle. */
function FilaComision({ c }: { c: SellerCommissionDto }) {
  const [expandida, setExpandida] = useState(false);
  const pendiente = c.status === 'pending';

  return (
    <>
      <tr
        className={`border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50/60 transition-colors`}
        onClick={() => setExpandida((v) => !v)}
        aria-expanded={expandida}
      >
        {/* Especialista + tipo */}
        <td className="px-5 py-3">
          <p className="font-semibold text-slate-800 text-sm">{c.specialistName}</p>
          <p className="text-xs text-slate-400 mt-0.5">{tipoLabel(c.type, c.planKey)}</p>
        </td>

        {/* Monto */}
        <td className="px-5 py-3 text-right tabular-nums">
          <span className="text-sm font-bold text-slate-900">{fmtUsd(c.amountUsd)}</span>
        </td>

        {/* Estado */}
        <td className="px-5 py-3">
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              pendiente ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {pendiente ? (
              <Clock className="w-3 h-3 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3 h-3 shrink-0" />
            )}
            {pendiente ? 'Pendiente' : 'Pagada'}
          </span>
        </td>

        {/* Fecha */}
        <td className="px-5 py-3 text-slate-500 text-sm">{fmtDate(c.earnedAt)}</td>

        {/* Icono expandir */}
        <td className="px-4 py-3 text-slate-400">
          {expandida ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
      </tr>

      {expandida && (
        <tr className="bg-slate-50/80">
          <td colSpan={5} className="px-6 py-3">
            <p className="text-xs text-slate-500">{tipoAyuda(c.type)}</p>
            {!pendiente && c.paymentId && (
              <p className="text-xs text-emerald-700 mt-1">
                Liquidada el {fmtDate(c.earnedAt)} · ref. pago:{' '}
                <span className="font-mono text-[11px]">{c.paymentId.slice(0, 8)}…</span>
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Fila de un pago recibido.
 *
 * ⚠️ `receiptUrl` guarda el **path** del objeto en GCS, NO una URL: los comprobantes
 * son privados y su firma vence a los 15 minutos. Enlazarlo directo daba un 404.
 * Por eso se pide la firma a demanda, recién cuando el vendedor va a abrirlo.
 *
 * El monto en Bs se muestra con la tasa histórica del pago (no la de hoy).
 */
function FilaPago({ p }: { p: SellerPaymentDto }) {
  const [abriendo, setAbriendo] = useState(false);
  const [errorComprobante, setErrorComprobante] = useState<string | null>(null);

  async function abrirComprobante() {
    setAbriendo(true);
    setErrorComprobante(null);
    try {
      const res = await fetch(`/api/seller/payments/${p.id}/receipt-url`, {
        cache: 'no-store',
      });
      const json: { url?: string; error?: string } = await res.json();
      if (!res.ok || !json.url) {
        setErrorComprobante(json.error ?? 'No se pudo abrir el comprobante.');
        return;
      }
      window.open(json.url, '_blank', 'noopener,noreferrer');
    } catch {
      setErrorComprobante('Error de conexión al abrir el comprobante.');
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 py-4 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        {/*
          Manda lo que el vendedor efectivamente RECIBIÓ: bolívares. El USD queda
          como equivalente y la tasa como respaldo del cálculo, que es lo que
          permite cuadrar el monto contra el comprobante del banco.
          La tasa es la histórica del pago, nunca la de hoy.
        */}
        <div className="flex items-center gap-2 flex-wrap">
          {p.bcvRate !== null && p.bcvRate > 0 ? (
            <>
              <span className="text-sm font-bold text-slate-900 tabular-nums">
                {fmtBs(p.amountUsd, p.bcvRate)}
              </span>
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                · {fmtUsd(p.amountUsd)}
              </span>
            </>
          ) : (
            <span className="text-sm font-bold text-slate-900 tabular-nums">
              {fmtUsd(p.amountUsd)}
            </span>
          )}
          <span className="text-xs font-medium text-slate-500">{p.method}</span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Ref. <span className="font-mono">{p.reference}</span> · {fmtDate(p.paidAt)}
        </p>
        {p.bcvRate !== null && p.bcvRate > 0 ? (
          <p className="text-[11px] text-slate-400 mt-0.5">
            Tasa BCV del día del pago: {p.bcvRate.toFixed(2)} Bs/USD
          </p>
        ) : (
          <p className="text-[11px] text-slate-400 mt-0.5">
            No quedó registrada la tasa de este pago.
          </p>
        )}
        {p.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{p.notes}</p>}
      </div>

      {p.receiptUrl ? (
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void abrirComprobante();
            }}
            disabled={abriendo}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60"
            aria-label="Abrir comprobante"
          >
            {abriendo ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Comprobante
          </button>
          {errorComprobante && (
            <span className="text-[11px] text-red-600 text-right max-w-[180px]">
              {errorComprobante}
            </span>
          )}
        </div>
      ) : (
        <span className="text-xs text-slate-400 shrink-0">Sin comprobante</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function ComisionesPage() {
  // `bcvRate` (la tasa actual) se recibe pero NO se usa acá a propósito: lo pendiente
  // se informa solo en USD. Los bolívares salen de la tasa histórica de cada pago.
  const { commissions, payments, loading, error } = useComisionesData();

  const pendientes = commissions.filter((c) => c.status === 'pending');
  const pagadas = commissions.filter((c) => c.status === 'paid');
  const totalPendiente = pendientes.reduce((s, c) => s + c.amountUsd, 0);
  const totalCobrado = payments.reduce((s, p) => s + p.amountUsd, 0);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando comisiones…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">No se pudieron cargar las comisiones</p>
          <p className="text-red-600 mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  const sinComisiones = commissions.length === 0;

  return (
    <div className="space-y-6">
      {/* ��─ Totales ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total pendiente — el número que el vendedor entró a ver */}
        <div
          className="sm:col-span-2 rounded-xl p-5 sm:p-6 flex items-start gap-4"
          style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
        >
          <div className="bg-white/20 rounded-lg p-2.5 shrink-0">
            <DollarSign className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/80">Por cobrar</p>
            <p className="text-4xl font-extrabold text-white tabular-nums mt-0.5">
              {fmtUsd(totalPendiente)}
            </p>
            {/*
              Lo pendiente va SOLO en USD, a propósito. La comisión se calcula y se
              debe en dólares; los bolívares aparecen únicamente cuando el pago ya
              ocurrió, con la tasa de ESE día. Mostrar acá una conversión a la tasa
              de hoy prometería una cifra que casi seguro no va a ser la que reciba:
              entre que se genera la comisión y se liquida, la tasa se mueve.
            */}
            <p className="text-xs text-white/70 mt-1">
              {pendientes.length === 0
                ? 'Ninguna comisión pendiente por el momento'
                : `${pendientes.length} comisión${pendientes.length !== 1 ? 'es' : ''} sin liquidar`}
            </p>
            {pendientes.length > 0 && (
              <p className="text-[11px] text-white/60 mt-1">
                Se te transfiere en bolívares a la tasa del BCV del día del pago.
              </p>
            )}
          </div>
        </div>

        {/* Total cobrado */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-xs font-semibold text-slate-500">Total cobrado</p>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 tabular-nums">
            {fmtUsd(totalCobrado)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {payments.length === 0
              ? 'Sin pagos registrados'
              : `En ${payments.length} pago${payments.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* ── Estado vacío ─────────────────────────────────────────────── */}
      {sinComisiones && (
        <section className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <TrendingUp className="w-9 h-9 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">Todavía no tenés comisiones</p>
          <p className="text-xs text-slate-400 mt-2 max-w-xs mx-auto">
            Tus comisiones aparecen acá cuando un especialista que registraste completa el alta o
            pasa a un plan pago.
          </p>
        </section>
      )}

      {/* ── Tabla de comisiones ──────────────────────────────────────── */}
      {!sinComisiones && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Detalle de comisiones</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cada especialista genera hasta dos: una por el alta y otra por el plan pago.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Especialista / Tipo</th>
                  <th className="px-5 py-3 text-right">Monto</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Generada</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {/* Pendientes primero */}
                {pendientes.map((c) => (
                  <FilaComision key={c.id} c={c} />
                ))}
                {/* Separador visual si hay de los dos tipos */}
                {pendientes.length > 0 && pagadas.length > 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-2 bg-slate-50">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Ya cobradas
                      </span>
                    </td>
                  </tr>
                )}
                {pagadas.map((c) => (
                  <FilaComision key={c.id} c={c} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Historial de pagos ───────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Pagos recibidos</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cada vez que el administrador liquida tus comisiones queda registrado acá. El monto en
            Bs refleja la tasa del BCV vigente el día de cada pago.
          </p>
        </div>

        {payments.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-slate-500">Todavía no recibiste ningún pago.</p>
            {totalPendiente > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                Tenés {fmtUsd(totalPendiente)} pendientes de liquidación.
              </p>
            )}
          </div>
        ) : (
          <div className="px-5 divide-y-0">
            {payments.map((p) => (
              <FilaPago key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
