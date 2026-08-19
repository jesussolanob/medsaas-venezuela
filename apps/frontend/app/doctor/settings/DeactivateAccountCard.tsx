'use client';

/**
 * DeactivateAccountCard — zona de baja de la cuenta, al pie de "Mi perfil".
 *
 * Es una DESACTIVACIÓN, no una eliminación: la información del especialista
 * queda intacta y auditable, y un administrador puede volver a activarla. Por
 * eso el texto nunca habla de "borrar" — prometer un borrado que no ocurre es
 * peor que no ofrecerlo.
 *
 * El backend rechaza la baja con 422 mientras haya citas agendadas a futuro, y
 * ese mensaje ya viene redactado para el usuario y con la cantidad exacta, así
 * que se muestra tal cual en vez de un error genérico.
 *
 * Confirmación por frase tipeada: el botón queda inerte hasta escribir
 * "DAR DE BAJA". Un modal de sí/no se toca por accidente; esto no.
 */

import { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { blockedLogoutAction } from '../blocked-logout-action';

/** Frase exacta que habilita el botón de confirmación. */
const CONFIRM_PHRASE = 'DAR DE BAJA';

export default function DeactivateAccountCard() {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Fecha hasta la que conserva el plan cuando la baja quedó programada. */
  const [programada, setProgramada] = useState<string | null>(null);

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
      const res = await fetch('/api/doctor/account/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // El 422 de citas pendientes trae el conteo real y está escrito para
        // el especialista: se muestra literal.
        setError(body.error ?? 'No se pudo dar de baja la cuenta. Intenta de nuevo.');
        setSubmitting(false);
        return;
      }

      const body = (await res.json().catch(() => ({}))) as { activeUntil?: string | null };

      // Baja PROGRAMADA: todavía le quedan días de un plan que pagó, así que la
      // cuenta sigue encendida hasta esa fecha. Cerrarle la sesión acá sería
      // mentirle: puede seguir trabajando hasta el vencimiento.
      if (body.activeUntil) {
        const hasta = new Date(body.activeUntil).toLocaleDateString('es-VE', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        setProgramada(hasta);
        setSubmitting(false);
        setOpen(false);
        return;
      }

      // La cuenta ya está apagada: cualquier llamada siguiente daría 403.
      // Se cierra sesión de inmediato y el login explica qué pasó.
      await blockedLogoutAction(true);
    } catch {
      setError('No se pudo conectar con el servidor. Intenta de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <>
      {/*
        Tono GRIS, no rojo (pedido del dueño, 2026-08-19).

        La tarjeta vive al final de /doctor/upgrade, entre planes que invitan a
        comprar: en rojo de alerta gritaba más que el resto de la página y
        parecía una advertencia sobre la cuenta. La confirmación por frase
        tipeada sigue siendo la protección real contra el toque accidental —
        no hace falta que el color asuste. El rojo se conserva DENTRO del modal,
        donde ya se está decidiendo la baja.
      */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mt-6">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
            <AlertTriangle className="w-4.5 h-4.5 text-slate-500" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            {programada && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-800">
                  Registramos tu baja. Conservas tu plan actual y el acceso completo hasta el{' '}
                  <strong>{programada}</strong>, porque ya lo pagaste. Ese día tu cuenta pasa al
                  plan gratuito. Si cambias de idea, escríbenos antes de esa fecha.
                </p>
              </div>
            )}
            <h3 className="text-sm font-bold text-slate-800">Dar de baja mi cuenta</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Tu cuenta queda desactivada y pierdes el acceso al portal. Tu enlace público deja de
              aceptar reservas. <strong className="text-slate-600">No se borra nada</strong>: tus
              pacientes, consultas e historia clínica quedan guardados. Para reactivarla más
              adelante, comunícate con el soporte de Delta Salud.
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
          aria-labelledby="deactivate-title"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 id="deactivate-title" className="text-base font-bold text-slate-800">
                Dar de baja mi cuenta
              </h2>
              <button
                onClick={closeModal}
                disabled={submitting}
                aria-label="Cerrar"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                <p className="text-xs text-amber-800 leading-relaxed">
                  Al confirmar, se cierra tu sesión y no vas a poder volver a entrar por tu cuenta.
                  La reactivación la hace un administrador de Delta Salud.
                </p>
              </div>

              <div>
                <label
                  htmlFor="deactivate-reason"
                  className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
                >
                  ¿Por qué te vas? (opcional)
                </label>
                <textarea
                  id="deactivate-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  rows={3}
                  disabled={submitting}
                  placeholder="Nos ayuda a mejorar"
                  className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-teal-300 disabled:bg-slate-50"
                />
              </div>

              <div>
                <label
                  htmlFor="deactivate-phrase"
                  className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
                >
                  Escribe <span className="text-red-600">{CONFIRM_PHRASE}</span> para confirmar
                </label>
                <input
                  id="deactivate-phrase"
                  type="text"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  disabled={submitting}
                  autoComplete="off"
                  className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 disabled:bg-slate-50"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
                  <p className="text-xs text-red-700 leading-relaxed">{error}</p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={closeModal}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void handleConfirm()}
                  disabled={!canConfirm}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-40 disabled:hover:bg-red-600 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Dando de baja…
                    </>
                  ) : (
                    'Confirmar baja'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
