'use client';

/**
 * PlanPaymentModal — Modal de pago manual para cambio/renovación de plan.
 *
 * Flujo en 4 pasos:
 *   1. Resumen del plan: USD + Bs a tasa BCV + instrucciones de pago.
 *   2. Subir comprobante (imagen o PDF, max 10 MB).
 *   3. Indicar número de referencia + banco.
 *   4. Confirmar → POST /api/doctor/subscription-payments → pantalla de éxito.
 *
 * El monto en Bs y la tasa BCV los calcula el servidor (GET checkout-info).
 * El frontend solo guarda el `path` del comprobante (no la URL firmada).
 */

import { useState, useEffect, useRef } from 'react';
import {
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Upload,
  FileText,
  Building2,
  Hash,
  ArrowLeft,
  ArrowRight,
  Clock,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Period = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

interface Bank {
  code: string;
  name: string;
}

interface CheckoutInfo {
  planName: string;
  planKey: string;
  period: string;
  amountUsd: number;
  amountBs: number;
  bcvRate: number;
  bcvRateDate: string;
  banks: Bank[];
  paymentInstructions: string;
}

interface Props {
  planKey: string;
  planName: string;
  period: Period;
  onClose: () => void;
  onSuccess: () => void;
}

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'mensual',
  quarterly: 'trimestral',
  semiannual: 'semestral',
  annual: 'anual',
};

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const inp =
  'w-full px-3.5 py-2.5 rounded-xl text-sm font-medium outline-none transition-all border-2 border-slate-200 bg-white focus:border-teal-400 text-slate-800';
const inpErr =
  'w-full px-3.5 py-2.5 rounded-xl text-sm font-medium outline-none transition-all border-2 border-red-300 bg-red-50 focus:border-red-400 text-slate-800';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModalStep({ current, label }: { current: number; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--dh-gray-400)' }}>
      <span
        className="font-bold"
        style={{ color: 'var(--dh-turquoise-700)', fontFamily: 'var(--dh-font-mono)' }}
      >
        {current}/4
      </span>
      <span>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PlanPaymentModal({ planKey, planName, period, onClose, onSuccess }: Props) {
  const [modalStep, setModalStep] = useState<1 | 2 | 3 | 4 | 'success'>(1);
  const [checkoutInfo, setCheckoutInfo] = useState<CheckoutInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [infoError, setInfoError] = useState<string | null>(null);

  // Step 2: file upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Step 3: reference and bank
  const [referenceNumber, setReferenceNumber] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [refError, setRefError] = useState<string | null>(null);
  const [bankError, setBankError] = useState<string | null>(null);

  // Step 4: submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load checkout info on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    // loadingInfo starts as true and infoError as null — no sync setState needed here.

    fetch(
      `/api/doctor/subscription-payments/checkout-info?planKey=${encodeURIComponent(planKey)}&period=${encodeURIComponent(period)}`,
    )
      .then(async (r) => {
        if (cancelled) return;
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Error al cargar la información del plan');
        setCheckoutInfo(j as CheckoutInfo);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setInfoError(e instanceof Error ? e.message : 'Error desconocido');
      })
      .finally(() => {
        if (!cancelled) setLoadingInfo(false);
      });

    return () => {
      cancelled = true;
    };
  }, [planKey, period]);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  // ---------------------------------------------------------------------------
  // File selection
  // ---------------------------------------------------------------------------

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);

    if (!ALLOWED_MIME.includes(file.type)) {
      setFileError('Formato no permitido. Usa JPEG, PNG, WebP, GIF o PDF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError('El archivo supera el límite de 10 MB.');
      return;
    }

    setSelectedFile(file);
    setUploadedPath(null);

    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    if (file.type.startsWith('image/')) {
      setFilePreviewUrl(URL.createObjectURL(file));
    } else {
      setFilePreviewUrl(null);
    }
  }

  async function uploadFile(): Promise<string | null> {
    if (!selectedFile) return null;
    if (uploadedPath) return uploadedPath; // already uploaded

    setUploadingFile(true);
    setFileError(null);
    try {
      const form = new FormData();
      form.append('file', selectedFile);
      form.append('kind', 'receipt');
      const r = await fetch('/api/storage/upload', { method: 'POST', body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al subir el comprobante');
      const path = j.path as string;
      setUploadedPath(path);
      return path;
    } catch (e: unknown) {
      setFileError(e instanceof Error ? e.message : 'Error al subir el comprobante');
      return null;
    } finally {
      setUploadingFile(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step navigation
  // ---------------------------------------------------------------------------

  async function goFromStep2ToStep3() {
    if (!selectedFile && !uploadedPath) {
      setFileError('Selecciona el comprobante de pago');
      return;
    }
    const path = await uploadFile();
    if (!path) return; // upload error shown in fileError
    setModalStep(3);
  }

  function goFromStep3ToStep4() {
    let hasError = false;
    if (!referenceNumber.trim()) {
      setRefError('El número de referencia es obligatorio');
      hasError = true;
    }
    if (!bankCode) {
      setBankError('Selecciona el banco');
      hasError = true;
    }
    if (hasError) return;
    setModalStep(4);
  }

  async function submitPayment() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch('/api/doctor/subscription-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planKey,
          period,
          bankCode,
          referenceNumber: referenceNumber.trim(),
          receiptPath: uploadedPath,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al enviar el pago');
      setModalStep('success');
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--dh-gray-100)' }}
        >
          <div>
            <h3
              className="font-bold text-[15px]"
              style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)' }}
            >
              Pagar plan {planName}
            </h3>
            {modalStep !== 'success' && typeof modalStep === 'number' && (
              <div className="mt-0.5">
                <ModalStep
                  current={modalStep}
                  label={
                    modalStep === 1
                      ? 'Resumen del pago'
                      : modalStep === 2
                        ? 'Subir comprobante'
                        : modalStep === 3
                          ? 'Datos de la transferencia'
                          : 'Confirmar envío'
                  }
                />
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            style={{ color: 'var(--dh-gray-400)' }}
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto">
          {/* ── STEP 1: Summary ── */}
          {modalStep === 1 && (
            <div className="px-6 py-5 space-y-5">
              {loadingInfo ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2
                    className="w-6 h-6 animate-spin"
                    style={{ color: 'var(--dh-gray-300)' }}
                  />
                </div>
              ) : infoError ? (
                <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 bg-red-50 border border-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                  <p className="text-sm text-red-600">{infoError}</p>
                </div>
              ) : checkoutInfo ? (
                <>
                  {/* Amounts */}
                  <div
                    className="rounded-xl p-4 space-y-3"
                    style={{
                      background: 'var(--dh-turquoise-50)',
                      border: '1px solid var(--dh-turquoise-100)',
                    }}
                  >
                    <div className="flex items-baseline justify-between">
                      <span
                        className="text-sm font-semibold"
                        style={{ color: 'var(--dh-turquoise-700)' }}
                      >
                        {planName} — ciclo {PERIOD_LABELS[period] ?? period}
                      </span>
                    </div>
                    <div className="flex items-end gap-3">
                      <div>
                        <p
                          className="text-[11px] font-semibold uppercase tracking-wide"
                          style={{ color: 'var(--dh-gray-400)', fontFamily: 'var(--dh-font-mono)' }}
                        >
                          Total a pagar
                        </p>
                        <p
                          className="text-2xl font-bold"
                          style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)' }}
                        >
                          $
                          {checkoutInfo.amountUsd.toLocaleString('es-VE', {
                            minimumFractionDigits: 2,
                          })}{' '}
                          USD
                        </p>
                        <p
                          className="text-sm font-semibold"
                          style={{ color: 'var(--dh-turquoise-700)' }}
                        >
                          Bs.{' '}
                          {checkoutInfo.amountBs.toLocaleString('es-VE', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                    </div>
                    <p
                      className="text-[11px]"
                      style={{ color: 'var(--dh-gray-500)', fontFamily: 'var(--dh-font-mono)' }}
                    >
                      Tasa BCV:{' '}
                      {checkoutInfo.bcvRate.toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      Bs/USD · actualizada el{' '}
                      {new Intl.DateTimeFormat('es-VE', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      }).format(new Date(checkoutInfo.bcvRateDate))}
                    </p>
                  </div>

                  {/* Payment instructions */}
                  <div>
                    <h4
                      className="text-xs font-bold uppercase tracking-wide mb-2"
                      style={{ color: 'var(--dh-gray-700)', fontFamily: 'var(--dh-font-mono)' }}
                    >
                      Instrucciones de pago
                    </h4>
                    <div
                      className="rounded-xl p-4 text-sm whitespace-pre-line leading-relaxed"
                      style={{
                        background: 'var(--dh-gray-50)',
                        color: 'var(--dh-gray-800)',
                        border: '1px solid var(--dh-gray-100)',
                      }}
                    >
                      {checkoutInfo.paymentInstructions}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* ── STEP 2: Upload receipt ── */}
          {modalStep === 2 && (
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm" style={{ color: 'var(--dh-gray-600)' }}>
                Sube una imagen o PDF del comprobante de pago. Máximo 10 MB.
              </p>

              {fileError && (
                <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 bg-red-50 border border-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                  <p className="text-sm text-red-600">{fileError}</p>
                </div>
              )}

              {/* Drop zone */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed rounded-xl p-6 text-center transition-all hover:border-teal-400 hover:bg-teal-50"
                style={{ borderColor: selectedFile ? 'var(--dh-turquoise)' : 'var(--dh-gray-200)' }}
              >
                {selectedFile ? (
                  <div className="space-y-1">
                    <FileText
                      className="w-8 h-8 mx-auto"
                      style={{ color: 'var(--dh-turquoise)' }}
                    />
                    <p className="text-sm font-semibold" style={{ color: 'var(--dh-ink)' }}>
                      {selectedFile.name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--dh-gray-400)' }}>
                      {(selectedFile.size / 1024).toFixed(0)} KB · Toca para cambiar
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 mx-auto" style={{ color: 'var(--dh-gray-300)' }} />
                    <p className="text-sm font-semibold" style={{ color: 'var(--dh-gray-700)' }}>
                      Seleccionar comprobante
                    </p>
                    <p className="text-xs" style={{ color: 'var(--dh-gray-400)' }}>
                      JPEG, PNG, WebP, GIF o PDF · máx. 10 MB
                    </p>
                  </div>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                onChange={handleFileChange}
                className="sr-only"
                aria-label="Seleccionar comprobante"
              />

              {/* Image preview */}
              {filePreviewUrl && (
                <div className="rounded-xl overflow-hidden border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={filePreviewUrl}
                    alt="Vista previa del comprobante"
                    className="w-full max-h-52 object-contain bg-slate-50"
                  />
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Reference + bank ── */}
          {modalStep === 3 && checkoutInfo && (
            <div className="px-6 py-5 space-y-5">
              {/* Reference number */}
              <div>
                <label
                  htmlFor="pm-ref"
                  className="block text-xs font-semibold mb-1.5"
                  style={{ color: 'var(--dh-gray-700)' }}
                >
                  Número de referencia <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Hash
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: 'var(--dh-gray-400)' }}
                  />
                  <input
                    id="pm-ref"
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => {
                      setReferenceNumber(e.target.value);
                      if (refError) setRefError(null);
                    }}
                    placeholder="Ej. 00123456789"
                    className={`${refError ? inpErr : inp} pl-10`}
                    aria-invalid={!!refError}
                  />
                </div>
                {refError && <p className="text-xs text-red-500 mt-1">{refError}</p>}
              </div>

              {/* Bank */}
              <div>
                <label
                  htmlFor="pm-bank"
                  className="block text-xs font-semibold mb-1.5"
                  style={{ color: 'var(--dh-gray-700)' }}
                >
                  Banco de origen <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Building2
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: 'var(--dh-gray-400)' }}
                  />
                  <select
                    id="pm-bank"
                    value={bankCode}
                    onChange={(e) => {
                      setBankCode(e.target.value);
                      if (bankError) setBankError(null);
                    }}
                    className={`${bankError ? inpErr : inp} pl-10`}
                    aria-invalid={!!bankError}
                  >
                    <option value="">Selecciona el banco...</option>
                    {checkoutInfo.banks.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                {bankError && <p className="text-xs text-red-500 mt-1">{bankError}</p>}
              </div>
            </div>
          )}

          {/* ── STEP 4: Confirm ── */}
          {modalStep === 4 && checkoutInfo && (
            <div className="px-6 py-5 space-y-4">
              {submitError && (
                <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 bg-red-50 border border-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                  <p className="text-sm text-red-600">{submitError}</p>
                </div>
              )}

              <div
                className="rounded-xl p-4 space-y-2"
                style={{ background: 'var(--dh-gray-50)', border: '1px solid var(--dh-gray-100)' }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-wide"
                  style={{ color: 'var(--dh-gray-400)', fontFamily: 'var(--dh-font-mono)' }}
                >
                  Resumen del envío
                </p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--dh-gray-600)' }}>Plan</span>
                    <span className="font-semibold" style={{ color: 'var(--dh-ink)' }}>
                      {planName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--dh-gray-600)' }}>Monto</span>
                    <span className="font-semibold" style={{ color: 'var(--dh-ink)' }}>
                      ${checkoutInfo.amountUsd.toFixed(2)} USD
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--dh-gray-600)' }}>Referencia</span>
                    <span
                      className="font-semibold"
                      style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-mono)' }}
                    >
                      #{referenceNumber}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--dh-gray-600)' }}>Banco</span>
                    <span className="font-semibold" style={{ color: 'var(--dh-ink)' }}>
                      {checkoutInfo.banks.find((b) => b.code === bankCode)?.name ?? bankCode}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--dh-gray-600)' }}>Comprobante</span>
                    <span className="font-semibold" style={{ color: 'var(--dh-turquoise-700)' }}>
                      Adjunto ✓
                    </span>
                  </div>
                </div>
              </div>

              <div
                className="flex items-start gap-2.5 rounded-xl px-4 py-3"
                style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}
              >
                <Clock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#D97706' }} />
                <p className="text-xs leading-relaxed" style={{ color: '#92400E' }}>
                  El pago quedará <strong>en revisión</strong>. El equipo de Delta Salud lo
                  verificará y activará tu plan — normalmente en menos de 24 horas hábiles.
                </p>
              </div>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {modalStep === 'success' && (
            <div className="px-6 py-10 text-center space-y-5">
              <div
                className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
                style={{ background: 'var(--dh-turquoise-50)' }}
              >
                <CheckCircle2 className="w-8 h-8" style={{ color: 'var(--dh-turquoise)' }} />
              </div>
              <div className="space-y-2">
                <h3
                  className="font-bold text-lg"
                  style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)' }}
                >
                  Pago enviado correctamente
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--dh-gray-600)' }}>
                  Tu comprobante está en revisión. Te notificaremos cuando el equipo lo apruebe y tu
                  plan sea activado.
                </p>
              </div>
              <button
                onClick={onSuccess}
                className="w-full py-3 rounded-xl text-white font-bold text-sm transition-opacity hover:opacity-90"
                style={{ background: 'var(--dh-turquoise)' }}
              >
                Entendido
              </button>
            </div>
          )}
        </div>

        {/* Modal footer with navigation buttons */}
        {modalStep !== 'success' && (
          <div
            className="px-6 py-4 flex items-center gap-3 shrink-0"
            style={{ borderTop: '1px solid var(--dh-gray-100)' }}
          >
            {/* Back button */}
            {typeof modalStep === 'number' && modalStep > 1 && (
              <button
                type="button"
                onClick={() =>
                  setModalStep((s) => (typeof s === 'number' ? ((s - 1) as 1 | 2 | 3 | 4) : s))
                }
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 hover:bg-slate-50 transition-colors"
                style={{ color: 'var(--dh-gray-700)' }}
                disabled={uploadingFile || submitting}
              >
                <ArrowLeft className="w-4 h-4" />
                Atrás
              </button>
            )}

            {/* Forward / submit button */}
            <button
              type="button"
              disabled={
                loadingInfo || uploadingFile || submitting || (modalStep === 1 && !!infoError)
              }
              onClick={() => {
                if (modalStep === 1) setModalStep(2);
                else if (modalStep === 2) goFromStep2ToStep3();
                else if (modalStep === 3) goFromStep3ToStep4();
                else if (modalStep === 4) submitPayment();
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--dh-turquoise)' }}
            >
              {uploadingFile ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Subiendo comprobante...
                </>
              ) : submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : modalStep === 4 ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Enviar pago
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4" />
                  Continuar
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
