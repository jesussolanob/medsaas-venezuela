'use client';

import { Upload, Loader2, CheckCircle2, Clock } from 'lucide-react';
import {
  METHODS_WITH_RECEIPT,
  PAYMENT_LABELS,
  FALLBACK_PAYMENT_METHODS,
} from '../appointment-flow.utils';

type Props = {
  profilePaymentMethods: string[];
  profilePaymentDetails: Record<string, Record<string, string>>;
  paymentMethod: string | null;
  setPaymentMethod: (m: string | null) => void;
  paymentReference: string;
  setPaymentReference: (r: string) => void;
  receiptFile: File | null;
  setReceiptFile: (f: File | null) => void;
  uploadingReceipt: boolean;
  usePackage: string | null;
  submitting: boolean;
  canSubmit: boolean;
  submit: () => Promise<void>;
};

export default function StepPayment({
  profilePaymentMethods,
  profilePaymentDetails,
  paymentMethod,
  setPaymentMethod,
  paymentReference,
  setPaymentReference,
  receiptFile,
  setReceiptFile,
  uploadingReceipt,
  usePackage,
  submitting,
  canSubmit,
  submit,
}: Props) {
  // If the patient is using a package, no payment needed
  if (usePackage) {
    return (
      <div className="space-y-4">
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-sm text-violet-800">
          Esta consulta está cubierta por el paquete prepagado. No requiere pago adicional.
        </div>
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={submitting || !canSubmit}
            className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Crear consulta
          </button>
        </div>
      </div>
    );
  }

  const activeMethods =
    profilePaymentMethods.length > 0 ? profilePaymentMethods : FALLBACK_PAYMENT_METHODS;
  const needsReceipt =
    paymentMethod !== null && paymentMethod !== '' && METHODS_WITH_RECEIPT.includes(paymentMethod);
  const methodDetails =
    paymentMethod !== null && paymentMethod !== '' && needsReceipt
      ? (profilePaymentDetails[paymentMethod] ?? null)
      : null;

  return (
    <div className="space-y-4">
      {/* Métodos activos del médico */}
      <div>
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
          Método de pago
        </p>
        <div className="grid grid-cols-2 gap-2">
          {activeMethods.map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => {
                setPaymentMethod(method);
                setPaymentReference('');
                setReceiptFile(null);
              }}
              className={`px-3 py-2.5 rounded-xl border-2 text-left text-sm font-semibold transition-all ${
                paymentMethod === method
                  ? 'border-teal-400 bg-teal-50 text-teal-800'
                  : 'border-slate-200 bg-white hover:border-teal-300 text-slate-700'
              }`}
            >
              {PAYMENT_LABELS[method] ?? method}
            </button>
          ))}
        </div>
      </div>

      {/* Datos de cuenta del método seleccionado */}
      {methodDetails && Object.keys(methodDetails).length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 space-y-1">
          <p className="text-xs font-bold text-slate-700 mb-1">Datos para el pago:</p>
          {Object.entries(methodDetails).map(([key, val]) =>
            val ? (
              <p key={key} className="text-xs text-slate-600">
                <span className="font-semibold capitalize">{key}:</span> {String(val)}
              </p>
            ) : null,
          )}
        </div>
      )}

      {/* Referencia y comprobante */}
      {needsReceipt && (
        <div className="space-y-2">
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Referencia del pago
            </label>
            <input
              type="text"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="Nº de referencia o hash"
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Comprobante (foto o PDF)
            </label>
            <label className="mt-1 flex items-center gap-2 px-3 py-2 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-600 cursor-pointer hover:bg-slate-50">
              {uploadingReceipt ? (
                <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploadingReceipt
                ? 'Subiendo...'
                : receiptFile
                  ? receiptFile.name
                  : 'Subir comprobante...'}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {receiptFile && !uploadingReceipt && (
              <button
                type="button"
                onClick={() => setReceiptFile(null)}
                className="text-xs text-red-500 mt-1"
              >
                Quitar archivo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pagar después */}
      <div className="border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => {
            setPaymentMethod(null);
            setPaymentReference('');
            setReceiptFile(null);
          }}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold transition-all ${
            paymentMethod === null
              ? 'border-amber-400 bg-amber-50 text-amber-800'
              : 'border-slate-200 text-slate-500 hover:border-amber-300 hover:bg-amber-50/50'
          }`}
        >
          <Clock className="w-4 h-4" />
          Pagar después (dejar cita como pendiente de pago)
        </button>
        {paymentMethod === null && (
          <p className="text-xs text-amber-700 mt-1 text-center">
            La cita se creará con pago pendiente. El doctor puede registrarlo después.
          </p>
        )}
      </div>

      {/* Botón crear consulta */}
      <div className="flex justify-end mt-2">
        <button
          onClick={submit}
          disabled={submitting || !canSubmit || uploadingReceipt}
          className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 flex items-center gap-2"
        >
          {submitting || uploadingReceipt ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          {uploadingReceipt ? 'Subiendo comprobante...' : 'Crear consulta'}
        </button>
      </div>
    </div>
  );
}
