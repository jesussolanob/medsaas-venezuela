'use client';

/**
 * NoShowModal — flujo completo de "el paciente no asistió".
 *
 * Reemplaza al `confirm()` del navegador que solo cambiaba el estado. Ahora, en
 * un mismo paso, el especialista decide las tres cosas que definen el caso:
 *
 *   1. Marca la inasistencia (PUT estado de la cita → `no_show`).
 *   2. Aplica o no una MULTA por inasistencia (por defecto $0).
 *   3. Dice si el paciente reagenda; si sí, elige fecha y hora ahí mismo
 *      reusando el RescheduleModal que ya existía.
 *
 * Reglas de plata (decididas por el dueño, 2026-08-16):
 *
 *   | pago      | reagenda | resultado                                          |
 *   |-----------|----------|----------------------------------------------------|
 *   | pendiente | no       | costo = multa (0 por defecto) → sale de Por cobrar  |
 *   | pendiente | sí       | costo = costo + multa, sigue pendiente              |
 *   | aprobado  | no       | costo intacto; sin multa no se toca nada            |
 *   | aprobado  | sí/no    | con multa: costo = costo + multa y el pago VUELVE a |
 *   |           |          | pendiente por el total (no hay pagos parciales)     |
 *
 * Lo cobrado no se devuelve por el portal: si el especialista devuelve plata,
 * corrige el monto a mano desde el panel de pago de la consulta.
 *
 * El modal es autónomo (hace sus propias llamadas) para que la agenda y el
 * detalle de consulta no dupliquen la regla — ese fue justamente el problema de
 * tener dos caminos para marcar la inasistencia.
 */

import { useEffect, useState } from 'react';
import { X, UserX, Loader2, AlertCircle } from 'lucide-react';
import RescheduleModal from '@/components/doctor/RescheduleModal';
import { useBcvRate } from '@/lib/useBcvRate';
import { showToast } from '@/components/ui/Toaster';
import {
  getConsultation,
  updateAppointmentStatus,
  updateConsultationPaymentDetails,
} from '@/app/doctor/consultations/actions';

type PaymentStatus = 'pending' | 'approved';

export interface NoShowResult {
  /** Monto que quedó en la consulta (null = no se tocó). */
  amount: number | null;
  /** Estado de pago final (null = no se tocó). */
  paymentStatus: PaymentStatus | null;
  /** true si el especialista además reagendó la cita. */
  rescheduled: boolean;
}

export interface NoShowModalProps {
  /** Consulta vinculada. Sin consulta no hay plata que ajustar (solo se marca la cita). */
  consultationId: string | null;
  /** Cita vinculada. Sin cita no se puede persistir el estado ni reagendar. */
  appointmentId: string | null;
  patientName: string;
  /** ISO de la cita actual — lo necesita el RescheduleModal para mostrar el "desde". */
  scheduledAt: string;
  onClose: () => void;
  onDone: (result: NoShowResult) => void;
}

export default function NoShowModal({
  consultationId,
  appointmentId,
  patientName,
  scheduledAt,
  onClose,
  onDone,
}: NoShowModalProps) {
  // La divisa la elige el especialista en Configuración (puede ser $ o €).
  const { format: money } = useBcvRate();

  // Datos frescos de la consulta. NO se reciben por props a propósito: la agenda
  // solo conoce `plan_price`, que desde que el monto es editable puede diferir
  // del costo real. Leer el valor equivocado y sumarle la multa daría un total
  // falso.
  const [loading, setLoading] = useState(Boolean(consultationId));
  const [amount, setAmount] = useState<number | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);

  const [applyFine, setApplyFine] = useState(false);
  const [fineInput, setFineInput] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Se guarda lo que efectivamente se persistió para poder informarlo al cerrar,
  // incluso cuando el flujo siguió por el modal de reagendar.
  const [reschedule, setReschedule] = useState<NoShowResult | null>(null);

  useEffect(() => {
    if (!consultationId) return;
    let alive = true;
    void (async () => {
      const c = await getConsultation(consultationId);
      if (!alive) return;
      if (c) {
        setAmount(c.amount);
        setPaymentStatus(c.payment_status);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [consultationId]);

  const fine = applyFine ? Math.max(0, parseFloat(fineInput) || 0) : 0;
  const isPaid = paymentStatus === 'approved';
  const currentAmount = amount ?? 0;

  /**
   * Calcula el parche de pago según la matriz de arriba.
   * Devuelve null cuando no hay nada que tocar.
   */
  function buildPatch(willReschedule: boolean): {
    amount?: number | null;
    payment_status?: PaymentStatus;
    no_show_fee?: number;
  } | null {
    if (!consultationId) return null;

    if (isPaid) {
      // Lo cobrado no se devuelve. Solo la multa mueve el costo, y al hacerlo la
      // consulta deja de estar saldada: vuelve a Por cobrar por el TOTAL y el
      // especialista la aprueba de nuevo cuando cobre la diferencia.
      //
      // `no_show_fee` NO es decorativo: es lo que le dice al backend que además
      // sincronice la tabla `payments`. Sin ese campo, la consulta quedaba con
      // el costo nuevo y el pago viejo aprobado, y la multa no se veía en
      // NINGUNA pantalla de finanzas (el pago seguía contando como ingreso y
      // Cobros excluye toda consulta con pago vinculado).
      if (fine <= 0) return null;
      return { amount: currentAmount + fine, no_show_fee: fine };
    }

    // Impaga y no reagenda: no quedó nada por cobrar salvo la multa.
    // Sin pago aprobado no hay nada que sincronizar, así que va por el camino
    // normal (el backend igual protege ese caso con `p.status = 'approved'`).
    if (!willReschedule) return { amount: fine };

    // Impaga y reagenda: el flujo sigue completo, la multa se suma al costo.
    return fine > 0 ? { amount: currentAmount + fine } : null;
  }

  async function confirm(willReschedule: boolean) {
    setError('');
    if (!appointmentId) {
      setError('Esta consulta no tiene una cita vinculada, no se puede registrar la inasistencia.');
      return;
    }
    setSaving(true);

    const statusResult = await updateAppointmentStatus(appointmentId, 'no_show');
    if (!statusResult.success) {
      setSaving(false);
      setError(statusResult.error || 'No se pudo registrar la inasistencia.');
      return;
    }

    const patch = buildPatch(willReschedule);
    let finalAmount: number | null = null;
    let finalStatus: PaymentStatus | null = null;

    if (patch) {
      const payResult = await updateConsultationPaymentDetails(consultationId as string, patch);
      if (!payResult.success) {
        // La inasistencia YA quedó registrada: no se revierte en silencio.
        setSaving(false);
        setError(
          `Se registró la inasistencia, pero no se pudo actualizar el monto: ${payResult.error}`,
        );
        return;
      }
      finalAmount = patch.amount ?? null;
      // Con multa sobre una consulta pagada el estado lo cambia el backend
      // (ApplyNoShowFee deja la consulta en 'pending' y sincroniza el pago), así
      // que no viaja en el parche: se refleja igual para que la lista no siga
      // mostrando "pagada" hasta el próximo refresco.
      finalStatus = patch.payment_status ?? (patch.no_show_fee ? 'pending' : null);
    }

    setSaving(false);

    if (willReschedule) {
      // El modal de reagendar toma la posta; el resultado se avisa al cerrarlo.
      setReschedule({ amount: finalAmount, paymentStatus: finalStatus, rescheduled: true });
      return;
    }

    showToast({ type: 'success', message: 'Inasistencia registrada' });
    onDone({ amount: finalAmount, paymentStatus: finalStatus, rescheduled: false });
  }

  if (reschedule && appointmentId) {
    return (
      <RescheduleModal
        appointmentId={appointmentId}
        patientName={patientName}
        currentScheduledAt={scheduledAt}
        infoMessage={
          isPaid
            ? 'La consulta ya estaba pagada: el pago viaja con la cita a la nueva fecha, no se cobra de nuevo.'
            : undefined
        }
        onClose={() => {
          // Cerró sin elegir fecha: la cita queda en "no asistió" y puede
          // reagendarla después desde el botón de siempre. El ajuste de monto
          // que ya se persistió sí se informa.
          onDone({ ...reschedule, rescheduled: false });
        }}
        onSuccess={() => {
          showToast({ type: 'success', message: 'Inasistencia registrada y cita reagendada' });
          onDone(reschedule);
        }}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
              <UserX className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">El paciente no asistió</h2>
              <p className="text-xs text-slate-500">{patientName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando la consulta…
          </div>
        ) : (
          <>
            {/* Qué va a pasar con la plata — dicho ANTES de confirmar */}
            {consultationId && (
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  isPaid
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                {isPaid ? (
                  <>
                    Esta consulta ya está <strong>pagada ({money(currentAmount)})</strong>. El monto
                    cobrado se mantiene: por el portal no hay devolución.
                  </>
                ) : (
                  <>
                    Esta consulta está <strong>impaga ({money(currentAmount)})</strong>. Si el
                    paciente no reagenda, el costo pasa a {money(fine)} y sale de{' '}
                    <strong>Por cobrar</strong>.
                  </>
                )}
              </div>
            )}

            {/* Multa por inasistencia */}
            {consultationId && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyFine}
                    onChange={(e) => setApplyFine(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-teal-500"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Cobrar multa por inasistencia
                  </span>
                </label>

                {applyFine && (
                  <div className="pl-6 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={fineInput}
                        onChange={(e) => setFineInput(e.target.value)}
                        className="w-28 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
                        aria-label="Monto de la multa"
                      />
                      <span className="text-xs text-slate-400">
                        se suma al costo de la consulta
                      </span>
                    </div>

                    {isPaid && fine > 0 && (
                      <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                          El costo pasa a {money(currentAmount + fine)} y la consulta vuelve a{' '}
                          <strong>Por cobrar</strong> por el total. Cuando cobres la diferencia,
                          aprobá el pago de nuevo.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <p className="text-sm text-slate-600">¿El paciente va a reagendar?</p>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                onClick={() => void confirm(false)}
                disabled={saving}
                className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                No reagenda
              </button>
              <button
                onClick={() => void confirm(true)}
                disabled={saving}
                className="flex-1 py-2.5 bg-teal-500 text-white rounded-lg text-sm font-semibold hover:bg-teal-600 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Sí, elegir fecha
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
