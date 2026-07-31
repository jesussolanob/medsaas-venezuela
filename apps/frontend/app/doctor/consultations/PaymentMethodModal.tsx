'use client';

/**
 * PaymentMethodModal.tsx
 *
 * Modal que se muestra cuando el doctor intenta aprobar/marcar pagado una
 * consulta SIN haber seleccionado el método de pago primero.
 *
 * Permite capturar:
 *   - Método de pago (OBLIGATORIO)
 *   - Referencia / Nro. comprobante (opcional)
 *   - Comprobante de pago — archivo imagen/PDF (opcional)
 *
 * Al confirmar:
 *   1. Persiste método/referencia/comprobante via `PATCH :id/payment-details`.
 *   2. Llama a `onConfirmed(method, reference, receiptPath)` para que el caller
 *      continúe con el flujo de aprobación/marcado sin volver a validar.
 */

import { useState, useEffect, useRef } from 'react';
import { X, CreditCard, Upload, FileText, Loader2, Check } from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PaymentMethodModalProps {
  open: boolean;
  consultationId: string;
  /** Métodos de pago habilitados para el doctor (filtrado desde settings). */
  availablePaymentMethods: string[];
  onClose: () => void;
  /**
   * Persiste método/referencia/comprobante via server action.
   * Llamado por el modal antes de invocar `onConfirmed`.
   * Devuelve `{ success: true }` o `{ success: false; error: string }`.
   */
  onPersist: (
    consultationId: string,
    method: string,
    reference: string | null,
    receiptPath: string | null,
  ) => Promise<{ success: boolean; error?: string }>;
  /**
   * Llamado cuando el doctor confirma el método y el persist fue exitoso.
   * El caller continúa el flujo de aprobación con estos valores.
   */
  onConfirmed: (method: string, reference: string, receiptPath: string | null) => void;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ALL_PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: 'efectivo', label: 'Efectivo USD' },
  { value: 'efectivo_bs', label: 'Efectivo Bs' },
  { value: 'pago_movil', label: 'Pago Móvil' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'binance', label: 'Binance' },
  { value: 'pos', label: 'POS / Punto de venta' },
  { value: 'seguro', label: 'Seguro' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentMethodModal({
  open,
  consultationId,
  availablePaymentMethods,
  onClose,
  onPersist,
  onConfirmed,
}: PaymentMethodModalProps) {
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Resetear campos al abrir — mismo patrón que ApprovePaymentModal
  useEffect(() => {
    if (open) {
      setMethod('');
      setReference('');
      setReceiptPath(null);
      setUploading(false);
      setSaving(false);
    }
  }, [open]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const methodList =
    availablePaymentMethods.length > 0
      ? ALL_PAYMENT_METHODS.filter((m) => availablePaymentMethods.includes(m.value))
      : ALL_PAYMENT_METHODS;

  async function handleConfirm() {
    if (!method.trim()) {
      showToast({ type: 'error', message: 'Selecciona el método de pago para continuar' });
      return;
    }

    setSaving(true);
    try {
      // Persistir detalles de pago via el callback del caller (server action)
      const result = await onPersist(consultationId, method, reference || null, receiptPath);

      if (!result.success) {
        showToast({
          type: 'error',
          message: result.error ?? 'No se pudo guardar el método de pago',
        });
        return;
      }

      onConfirmed(method, reference, receiptPath);
      onClose();
    } catch {
      showToast({
        type: 'error',
        message: 'Error al guardar el método de pago. Intenta de nuevo.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'receipt');
      const uploadRes = await fetch('/api/storage/upload', { method: 'POST', body: fd });
      const uploadJson = (await uploadRes.json()) as { data?: { url?: string; path?: string } };
      const path = uploadJson?.data?.path ?? uploadJson?.data?.url ?? null;
      if (uploadRes.ok && path) {
        setReceiptPath(path);
        showToast({ type: 'success', message: 'Comprobante subido correctamente' });
      } else {
        showToast({ type: 'error', message: 'No se pudo subir el comprobante' });
      }
    } catch {
      showToast({ type: 'error', message: 'Error al subir el comprobante' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.5)' }}
      onClick={(e) => {
        if (e.target === overlayRef.current && !saving && !uploading) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-method-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl g-bg flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2
                id="payment-method-modal-title"
                className="text-sm font-bold text-slate-800 leading-tight"
              >
                Método de pago requerido
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Selecciona el método antes de aprobar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving || uploading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Método de pago (obligatorio) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Método de pago <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                disabled={saving}
                className={`w-full text-sm border rounded-lg py-2 pl-3 pr-8 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all appearance-none bg-white disabled:text-slate-400 disabled:cursor-wait ${
                  !method ? 'text-slate-400 border-slate-200' : 'text-slate-800 border-teal-300'
                }`}
              >
                <option value="">— Selecciona el método —</option>
                {methodList.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>
            {!method && (
              <p className="text-[11px] text-slate-400 mt-1">
                El método es obligatorio para aprobar el cobro.
              </p>
            )}
          </div>

          {/* Referencia (opcional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Referencia <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={saving}
              placeholder="Ej: #12345, últimos 4 dígitos…"
              className="w-full text-sm border border-slate-200 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all bg-white text-slate-700 placeholder:text-slate-300 disabled:text-slate-400 disabled:cursor-wait"
            />
          </div>

          {/* Comprobante (opcional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Comprobante <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            {receiptPath ? (
              <div className="flex items-center gap-2">
                <a
                  href={receiptPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-teal-600 hover:text-teal-800 font-semibold flex items-center gap-1"
                >
                  <FileText className="w-3.5 h-3.5" /> Ver comprobante
                </a>
                <button
                  type="button"
                  disabled={saving || uploading}
                  onClick={() => setReceiptPath(null)}
                  className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors">
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                    <span className="text-xs text-teal-600">Subiendo…</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span className="text-xs text-slate-500">Adjuntar comprobante</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={uploading || saving}
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving || uploading}
            className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!method || saving || uploading}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-500 rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Guardando…
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                Confirmar método
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
