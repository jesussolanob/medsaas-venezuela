'use client';

/**
 * DeactivateSellerCard — zona de baja de la cuenta del vendedor.
 *
 * Espeja `app/doctor/settings/DeactivateAccountCard.tsx`: mismo tono gris en la
 * tarjeta, mismo rojo dentro del modal, y la misma confirmación por frase tipeada
 * —un modal de sí/no se toca por accidente, esto no—.
 *
 * DIFERENCIA CON LA DEL ESPECIALISTA
 * ----------------------------------
 * Al especialista lo BLOQUEAN las citas futuras, porque dejar pacientes colgados
 * perjudica a terceros. Al vendedor no lo bloquea nada: irse no perjudica a nadie
 * y Delta le sigue debiendo lo que le debe.
 *
 * Pero sí hay algo que tiene que leer ANTES de apretar, porque es la pregunta que
 * uno se hace al irse: "¿pierdo lo que me deben?". La respuesta es que no, y está
 * en el texto de la tarjeta. El backend devuelve además el pendiente exacto junto
 * con la baja, pero acá NO se muestra a propósito: llegaría en el instante previo
 * al logout, o sea informando cuando ya no se puede decidir. El monto lo tiene a
 * la vista en "Mis comisiones", que es donde sirve.
 *
 * Es una DESACTIVACIÓN, nunca un borrado: sus especialistas, comisiones y pagos
 * quedan bajo el mismo id y un administrador puede reactivar la cuenta.
 */

import { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { blockedLogoutAction } from '../../doctor/blocked-logout-action';

/** Frase exacta que habilita el botón de confirmación. */
const CONFIRM_PHRASE = 'DAR DE BAJA';

export default function DeactivateSellerCard() {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = phrase.trim().toUpperCase() === CONFIRM_PHRASE && !submitting;

  function closeModal() {
    if (submitting) return;
    setOpen(false);
    setPhrase('');
    setReason('');
    setError(null);
  }

  async function handleConfirm() {
    if (!canConfirm) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/seller/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'No se pudo dar de baja la cuenta. Intentá de nuevo.');
        setSubmitting(false);
        return;
      }

      // La cuenta ya está apagada: cualquier llamada siguiente daría 403, así que
      // se cierra sesión de inmediato y el login explica qué pasó.
      //
      // El pendiente que devuelve el backend NO se muestra acá a propósito: ya se
      // le advirtió ANTES de confirmar, con el dato que él mismo tiene a la vista
      // en "Mis comisiones". Mostrarlo después, en una pantalla que dura el
      // instante previo al logout, sería informar cuando ya no puede decidir.
      await blockedLogoutAction(true);
    } catch {
      setError('No se pudo conectar con el servidor. Intentá de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Tono gris, igual que la del especialista: la protección real es la frase
          tipeada, no el color. El rojo se reserva para adentro del modal. */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mt-6">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
            <AlertTriangle className="w-[18px] h-[18px] text-slate-500" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-800">Dar de baja mi cuenta</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Tu cuenta queda desactivada y perdés el acceso al portal. Tu enlace de referido deja
              de atribuir especialistas y no vas a generar comisiones nuevas.{' '}
              <strong className="text-slate-600">Lo que ya se te debe se te sigue debiendo</strong>:
              las comisiones pendientes no se borran y Delta te las paga igual. Para reactivar la
              cuenta, escribile al soporte de Delta Salud.
            </p>
            <button
              onClick={() => setOpen(true)}
              className="mt-3 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              Dar de baja mi cuenta
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="seller-deactivate-title"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 id="seller-deactivate-title" className="text-base font-bold text-slate-800">
                Dar de baja mi cuenta
              </h2>
              <button
                onClick={closeModal}
                disabled={submitting}
                aria-label="Cerrar"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                <p className="text-xs text-amber-800 leading-relaxed">
                  Al confirmar se cierra tu sesión y no vas a poder volver a entrar por tu cuenta.
                  La reactivación la hace un administrador de Delta Salud.
                </p>
              </div>

              <div>
                <label
                  htmlFor="seller-deactivate-reason"
                  className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
                >
                  ¿Por qué te vas? (opcional)
                </label>
                <textarea
                  id="seller-deactivate-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  rows={3}
                  disabled={submitting}
                  placeholder="Nos ayuda a mejorar"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 disabled:bg-slate-50"
                />
              </div>

              <div>
                <label
                  htmlFor="seller-deactivate-phrase"
                  className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
                >
                  Escribí <span className="font-mono text-slate-700">{CONFIRM_PHRASE}</span> para
                  confirmar
                </label>
                <input
                  id="seller-deactivate-phrase"
                  type="text"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  disabled={submitting}
                  autoComplete="off"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500/10 disabled:bg-slate-50"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleConfirm()}
                disabled={!canConfirm}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar baja
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
