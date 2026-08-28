'use client';

/**
 * SellerPaymentDetailsModal
 *
 * Vista de SOLO LECTURA de los datos de cobro de un vendedor.
 * El admin los consulta para saber cómo transferirle la comisión.
 *
 * Regla de lectura: NUNCA acceder a `paymentDetails[method]` directo.
 * Siempre pasar por `entriesOf` — la columna admite forma vieja (objeto suelto)
 * y forma nueva (lista), y `entriesOf` normaliza las dos.
 *
 * pago_movil y transferencia pueden tener varias entradas (MULTI_ENTRY_METHODS):
 * se muestran todas con su etiqueta distinguible.
 *
 * El que edita es el propio vendedor desde su portal. Acá solo se lee.
 */

import { useEffect, useState } from 'react';
import { X, Loader2, CreditCard, AlertTriangle } from 'lucide-react';
import { reportError } from '@/lib/report-error';
import {
  entriesOf,
  fieldLabel,
  entryLabel,
  MULTI_ENTRY_METHODS,
  type PaymentDetails,
} from '@/lib/payment-details';

interface SellerPaymentDetailsModalProps {
  sellerId: string;
  sellerName: string;
  onClose: () => void;
}

/** Rótulo legible para el bloque de cada método de pago. */
const METHOD_LABELS: Record<string, string> = {
  pago_movil: 'Pago Móvil',
  transferencia: 'Transferencia bancaria',
  zelle: 'Zelle',
  binance: 'Binance Pay',
  efectivo_usd: 'Efectivo USD',
  efectivo_bs: 'Efectivo Bs',
  pos: 'POS',
};

function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method.replace(/_/g, ' ');
}

export default function SellerPaymentDetailsModal({
  sellerId,
  sellerName,
  onClose,
}: SellerPaymentDetailsModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/admin/sellers/${sellerId}/payment-details`, {
          cache: 'no-store',
        });
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { paymentDetails: PaymentDetails };
          error?: string;
        };

        if (!alive) return;

        if (!res.ok || !json.success) {
          setError(json.error ?? 'No se pudieron cargar los datos de cobro.');
          return;
        }

        // paymentDetails puede ser null/undefined si el vendedor aún no los cargó
        setPaymentDetails(json.data?.paymentDetails ?? null);
      } catch (err: unknown) {
        if (!alive) return;
        reportError('SellerPaymentDetailsModal', 'load', err);
        setError('Error de conexión al cargar los datos de cobro.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [sellerId]);

  /** Métodos presentes en el JSONB, en el orden en que aparecen. */
  function activeMethods(): string[] {
    if (!paymentDetails) return [];
    return Object.keys(paymentDetails).filter((m) => entriesOf(paymentDetails, m).length > 0);
  }

  const methods = activeMethods();
  const isEmpty = !loading && !error && methods.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Datos de cobro</p>
              <p className="text-xs text-slate-500 mt-0.5">{sellerName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando datos de cobro…
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              {error}
            </div>
          ) : isEmpty ? (
            /* El vendedor todavía no cargó sus datos de cobro. Sin esta info no se le puede pagar. */
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <p className="text-sm font-bold">Sin datos de cobro</p>
              </div>
              <p className="text-sm text-amber-900">
                Este vendedor todavía no cargó sus datos de pago. No se le puede transferir una
                comisión hasta que los complete desde su portal.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {methods.map((method) => {
                const entries = entriesOf(paymentDetails, method);
                const isMulti = MULTI_ENTRY_METHODS.has(method);

                return (
                  <div key={method}>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                      {methodLabel(method)}
                    </p>

                    <div className="space-y-3">
                      {entries.map((entry, i) => (
                        <div
                          key={i}
                          className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2"
                        >
                          {/* Etiqueta de la entrada solo cuando puede haber varias */}
                          {isMulti && entries.length > 1 && (
                            <p className="text-xs font-semibold text-teal-700 mb-1">
                              {entryLabel(entry, i)}
                            </p>
                          )}

                          {Object.entries(entry).map(([key, value]) => (
                            <div key={key} className="flex items-start justify-between gap-4">
                              <span className="text-xs text-slate-500 shrink-0 pt-0.5">
                                {fieldLabel(key)}
                              </span>
                              <span className="text-sm font-semibold text-slate-800 text-right break-all">
                                {value}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 p-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="border border-slate-200 rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
