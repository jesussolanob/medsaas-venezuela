'use client';

/**
 * ApprovePaymentModal.tsx
 *
 * Modal para aprobar el pago de una consulta.
 * Permite confirmar el monto base (read-only) y agregar servicios adicionales
 * (descripción + monto). El total = base + Σ(extras) se envía al backend.
 *
 * Endpoint BFF: PATCH /api/doctor/consultations/:id/approve-payment
 * Body: { extras: Array<{ description: string; amount_usd: number }>, method?: string }
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, Trash2, DollarSign, Loader2, CheckCircle } from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';

export type ExtraItem = {
  description: string;
  amount_usd: number;
};

export type ExistingExtraItem = {
  id: string;
  description: string;
  amount_usd: number;
};

type ExtraRow = {
  /** Client-side key for list rendering */
  key: string;
  description: string;
  amount: string; // string so the input is controlled without clamping
};

type Props = {
  open: boolean;
  consultationId: string;
  /** Monto base fijo de la consulta. Se muestra read-only. */
  baseAmount: number;
  /** Extras ya guardados — se precarga la lista con estos valores al abrir. */
  existingExtras: ExistingExtraItem[];
  /** Método de pago activo en el panel (se envía al backend si está disponible). */
  paymentMethod?: string;
  onClose: () => void;
  /** Llamado con el total y los nuevos extra_items tras aprobar exitosamente. */
  onApproved: (total: number, extras: ExistingExtraItem[]) => void;
};

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `row-${keyCounter}`;
}

function buildRows(items: ExistingExtraItem[]): ExtraRow[] {
  return items.map((item) => ({
    key: nextKey(),
    description: item.description,
    amount: String(item.amount_usd),
  }));
}

export default function ApprovePaymentModal({
  open,
  baseAmount,
  existingExtras,
  onClose,
  onApproved,
}: Props) {
  const [rows, setRows] = useState<ExtraRow[]>([]);
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Resetear filas cada vez que se abre el modal
  useEffect(() => {
    if (open) {
      setRows(buildRows(existingExtras));
    }
  }, [open, existingExtras]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { key: nextKey(), description: '', amount: '' }]);
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }, []);

  const updateDescription = useCallback((key: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, description: value } : r)));
  }, []);

  const updateAmount = useCallback((key: string, value: string) => {
    // Allow only digits and a single decimal point
    const sanitized = value.replace(/[^0-9.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1');
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, amount: sanitized } : r)));
  }, []);

  /** Filas con descripción NO vacía y monto > 0 — las únicas que se envían. */
  function validExtras(): ExtraItem[] {
    return rows
      .filter((r) => r.description.trim().length > 0 && parseFloat(r.amount) > 0)
      .map((r) => ({ description: r.description.trim(), amount_usd: parseFloat(r.amount) }));
  }

  /** Filas que tienen monto pero no descripción — bloquean el envío. */
  function hasIncompleteRows(): boolean {
    return rows.some((r) => r.amount && parseFloat(r.amount) > 0 && !r.description.trim());
  }

  const extrasTotal = validExtras().reduce((acc, e) => acc + e.amount_usd, 0);
  const grandTotal = baseAmount + extrasTotal;

  function handleConfirm() {
    if (hasIncompleteRows()) {
      showToast({
        type: 'error',
        message: 'Completa la descripción de todos los servicios adicionales con monto.',
      });
      return;
    }

    // Este modal SOLO confirma el MONTO (base + servicios adicionales). NO persiste
    // a BD ni exige método de pago: el guardado real —y el requisito del método—
    // ocurre al presionar "Guardar pago" en el panel de detalles.
    setSaving(true);
    const extras = validExtras();
    const updatedExtras: ExistingExtraItem[] = extras.map((e, idx) => ({
      id: `local-${idx}`,
      description: e.description,
      amount_usd: e.amount_usd,
    }));
    onApproved(grandTotal, updatedExtras);
    onClose();
    setSaving(false);
  }

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approve-payment-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl g-bg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2
                id="approve-payment-title"
                className="text-sm font-bold text-slate-800 leading-tight"
              >
                Aprobar pago
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Confirma el cobro de esta consulta
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Monto base (read-only) */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Consulta (base)
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Monto base</span>
              <span className="text-sm font-bold text-slate-800">${baseAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Servicios adicionales */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Servicios adicionales
              </p>
              <button
                type="button"
                onClick={addRow}
                disabled={saving}
                className="flex items-center gap-1 text-[11px] font-semibold text-teal-600 hover:text-teal-700 transition-colors disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar servicio
              </button>
            </div>

            {rows.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                Sin servicios adicionales. El total es solo el monto base.
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => {
                  const amountVal = parseFloat(row.amount);
                  const hasAmountNoDesc = row.amount && amountVal > 0 && !row.description.trim();
                  return (
                    <div key={row.key} className="flex items-start gap-2">
                      {/* Descripción */}
                      <div className="flex-1">
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => updateDescription(row.key, e.target.value)}
                          placeholder="Descripción del servicio"
                          disabled={saving}
                          className={`w-full text-xs border rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all bg-white placeholder:text-slate-300 disabled:opacity-60 ${
                            hasAmountNoDesc
                              ? 'border-red-300 text-red-700'
                              : 'border-slate-200 text-slate-700'
                          }`}
                        />
                        {hasAmountNoDesc && (
                          <p className="text-[10px] text-red-500 mt-0.5">Descripción requerida</p>
                        )}
                      </div>
                      {/* Monto */}
                      <div className="w-24 shrink-0">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-semibold pointer-events-none">
                            $
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.amount}
                            onChange={(e) => updateAmount(row.key, e.target.value)}
                            placeholder="0.00"
                            disabled={saving}
                            className="w-full text-xs border border-slate-200 rounded-lg py-2 pl-5 pr-2 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all bg-white text-slate-700 placeholder:text-slate-300 disabled:opacity-60"
                          />
                        </div>
                      </div>
                      {/* Quitar fila */}
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        disabled={saving}
                        className="mt-0.5 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        aria-label="Quitar servicio"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Total */}
          <div className="rounded-xl border-2 border-teal-200 bg-teal-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-700">Total a cobrar</span>
              <span className="text-lg font-extrabold text-teal-700">${grandTotal.toFixed(2)}</span>
            </div>
            {extrasTotal > 0 && (
              <p className="text-[10px] text-teal-500 mt-1">
                Base ${baseAmount.toFixed(2)} + servicios ${extrasTotal.toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || hasIncompleteRows()}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-500 rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Aprobando…
              </>
            ) : (
              <>
                <CheckCircle className="w-3.5 h-3.5" />
                Confirmar cobro
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
