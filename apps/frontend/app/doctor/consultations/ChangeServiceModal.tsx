'use client';

/**
 * ChangeServiceModal.tsx
 *
 * Corrige el servicio contratado de una consulta.
 *
 * Existe porque el paciente se equivoca al elegir el paquete en la reserva
 * pública y hasta hoy no había forma de arreglarlo: quedaba cobrado el servicio
 * que no era y la única salida era rehacer la cita entera.
 *
 * Solo ofrece servicios EQUIVALENTES — misma cantidad de consultas. Cambiar entre
 * tamaños distintos obligaría a crear o borrar sesiones y a decidir qué pasa con
 * las ya agendadas; el backend también lo rechaza.
 *
 * El modal muestra ANTES de confirmar en cuánto queda el cobro: es la parte que
 * el especialista no puede adivinar y la que mueve dinero.
 */

import { useState } from 'react';
import { X, ArrowRight, Loader2, Check, Tag } from 'lucide-react';

export interface ChangeServiceOption {
  id: string;
  name: string;
  price_usd: number;
  sessions_count: number;
  is_active: boolean;
}

export interface ChangeServiceModalProps {
  open: boolean;
  /** Servicio actual de la consulta. Null cuando la cita nunca guardó plan. */
  currentPlanName: string | null;
  /** Monto vigente del cobro, para contrastarlo con el del servicio nuevo. */
  currentPriceUsd: number | null;
  /**
   * Consultas que incluye el servicio actual. Filtra la lista: solo se ofrece lo
   * equivalente. 1 para una consulta suelta.
   */
  currentSessions: number;
  /** true cuando la consulta pertenece a un paquete de varias sesiones. */
  isPackage: boolean;
  /** Catálogo completo del especialista; el modal filtra. */
  services: ChangeServiceOption[];
  /** Formatea un importe en la moneda que muestra la pantalla (lleva su símbolo). */
  formatAmount: (amount: number) => string;
  onClose: () => void;
  /** Persiste el cambio. Devuelve el error del backend tal cual para mostrarlo. */
  onConfirm: (planId: string) => Promise<{ success: boolean; error?: string }>;
}

export default function ChangeServiceModal({
  open,
  currentPlanName,
  currentPriceUsd,
  currentSessions,
  isPackage,
  services,
  formatAmount,
  onClose,
  onConfirm,
}: ChangeServiceModalProps) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No hace falta resetear al abrir: el padre monta este componente recién cuando
  // se abre y lo desmonta al cerrar, así que el estado nace limpio cada vez.
  if (!open) return null;

  const options = services.filter(
    (s) => s.is_active && s.sessions_count === currentSessions && s.name !== currentPlanName,
  );
  const selected = options.find((s) => s.id === selectedId) ?? null;

  async function handleConfirm() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const result = await onConfirm(selected.id);
      if (result.success) {
        onClose();
      } else {
        // El backend ya responde en español y explica el motivo real
        // (por ejemplo, que el servicio elegido tiene otra cantidad de consultas).
        setError(result.error ?? 'No se pudo cambiar el servicio');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.5)' }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-service-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl g-bg flex items-center justify-center shrink-0">
              <Tag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2
                id="change-service-modal-title"
                className="text-sm font-bold text-slate-800 leading-tight"
              >
                Cambiar el servicio
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Corrige el servicio que se eligió al reservar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Servicio actual */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Servicio actual
            </p>
            <p className="text-sm font-bold text-slate-800 mt-0.5">
              {currentPlanName ?? 'Sin servicio registrado'}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {currentPriceUsd != null && `${formatAmount(currentPriceUsd)} · `}
              {currentSessions > 1 ? `${currentSessions} consultas` : '1 consulta'}
            </p>
          </div>

          {options.length === 0 ? (
            <p className="text-xs text-slate-500 leading-relaxed">
              No hay otro servicio de{' '}
              {currentSessions > 1 ? `${currentSessions} consultas` : 'una consulta'} en tu
              catálogo. Solo se puede cambiar entre servicios del mismo tamaño: uno más grande o más
              chico obligaría a crear o eliminar consultas ya agendadas.
            </p>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Servicio correcto <span className="text-red-500">*</span>
              </label>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {options.map((s) => {
                  const isSelected = s.id === selectedId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={saving}
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg border transition-all disabled:cursor-wait ${
                        isSelected
                          ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-500/20'
                          : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 truncate">
                          {s.name}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {formatAmount(s.price_usd)}
                          {s.sessions_count > 1 && ` · ${s.sessions_count} consultas`}
                        </span>
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-teal-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Qué va a pasar — la parte que mueve dinero */}
          {selected && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-1">
              <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">
                Qué va a pasar
              </p>
              <p className="text-sm font-bold text-amber-800 flex items-center gap-1.5 flex-wrap">
                {currentPriceUsd != null && (
                  <>
                    <span className="line-through font-semibold text-amber-600">
                      {formatAmount(currentPriceUsd)}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
                {formatAmount(selected.price_usd)}
              </p>
              <p className="text-[11px] text-amber-700 leading-snug">
                El cobro se ajusta a ese monto y <strong>sigue aprobado</strong> si ya lo estaba.
                {isPackage &&
                  ' El cambio alcanza a todas las consultas del paquete y a las que estén por agendar.'}{' '}
                Queda registrado quién lo hizo y de cuánto a cuánto.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving || !selected}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white g-bg rounded-lg hover:opacity-90 disabled:bg-slate-200 disabled:bg-none disabled:text-slate-400 disabled:cursor-not-allowed transition-opacity"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cambiando…
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" /> Cambiar servicio
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
