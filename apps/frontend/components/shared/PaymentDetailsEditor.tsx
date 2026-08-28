'use client';

/**
 * PaymentDetailsEditor — editor de métodos de cobro.
 *
 * Componente compartido entre:
 *   - La pestaña "Pagos" de /doctor/settings (cómo el especialista cobra a pacientes)
 *   - La página /seller/cobros (cómo Delta Salud le paga al vendedor)
 *
 * Ambos usos leen/escriben `profiles.payment_details` (JSONB); la forma del dato
 * es la misma (ver lib/payment-details). Lo que cambia es:
 *   - El endpoint al que va el PUT
 *   - El contexto de los labels ("Métodos que acepto" vs "Cómo quiero cobrar")
 *
 * Regla: nadie lee `payment_details[metodo]` directo — todo pasa por `entriesOf`.
 *
 * El componente gestiona su propio estado interno (métodos activos, datos por
 * método, qué métodos están expandidos). El padre solo provee los valores
 * iniciales y la función de guardado. Para que el componente se reinicialice
 * si el padre carga datos de forma asíncrona, pasá un `key` que cambie cuando
 * los datos lleguen.
 */

import { useState } from 'react';
import {
  entriesOf,
  withEntries,
  MULTI_ENTRY_METHODS,
  type PaymentEntry,
} from '@/lib/payment-details';
import { CheckCircle, ChevronDown, ChevronUp, Save as SaveIcon, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Tipos y constantes (antes vivían en doctor/settings/page.tsx)
// ---------------------------------------------------------------------------

type PaymentMethodData = {
  id: string;
  label: string;
  emoji: string;
  fields: { key: string; label: string; placeholder?: string; type?: string }[];
};

/**
 * Métodos de cobro disponibles en la plataforma.
 * El orden importa: determina cómo aparecen en el acordeón.
 */
const PAYMENT_METHODS: PaymentMethodData[] = [
  {
    id: 'pago_movil',
    label: 'Pago Móvil',
    emoji: '📱',
    fields: [
      { key: 'bank', label: 'Banco', placeholder: 'Ej: Banesco' },
      { key: 'phone', label: 'Teléfono', placeholder: '0412-1234567' },
      { key: 'id_number', label: 'Cédula/RIF', placeholder: 'V-12345678' },
      { key: 'holder', label: 'Titular', placeholder: 'Carlos Ramírez' },
    ],
  },
  {
    id: 'transferencia',
    label: 'Transferencia',
    emoji: '🏦',
    fields: [
      { key: 'bank', label: 'Banco', placeholder: 'Ej: Banco de Venezuela' },
      { key: 'account', label: 'N° de cuenta', placeholder: '0102-xxxx-xx-xxxxxxxxxx' },
      { key: 'account_type', label: 'Tipo', placeholder: 'Corriente / Ahorro' },
      { key: 'id_number', label: 'Cédula/RIF', placeholder: 'V-12345678' },
      { key: 'holder', label: 'Titular', placeholder: 'Nombre del titular' },
    ],
  },
  {
    id: 'zelle',
    label: 'Zelle',
    emoji: '💳',
    fields: [
      { key: 'email', label: 'Email Zelle', placeholder: 'correo@email.com', type: 'email' },
      { key: 'holder', label: 'Nombre del titular', placeholder: 'Carlos Ramirez' },
      { key: 'bank', label: 'Banco (opcional)', placeholder: 'Chase, Bank of America…' },
    ],
  },
  {
    id: 'binance',
    label: 'Binance Pay',
    emoji: '₿',
    fields: [
      { key: 'binance_id', label: 'Binance ID', placeholder: '123456789' },
      { key: 'email', label: 'Email', placeholder: 'correo@email.com' },
    ],
  },
  { id: 'cash_usd', label: 'Efectivo USD', emoji: '💵', fields: [] },
  { id: 'cash_bs', label: 'Efectivo Bs', emoji: '💵', fields: [] },
  {
    id: 'pos',
    label: 'Punto de venta',
    emoji: '🛒',
    fields: [{ key: 'bank', label: 'Banco del POS', placeholder: 'Ej: Mercantil' }],
  },
];

/**
 * Formatea un número de cuenta bancaria venezolano: 20 dígitos agrupados como
 * xxxx-xxxx-xxxx-xxxx-xxxx. Descarta no-dígitos y recorta a 20.
 */
function formatBankAccount(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 20);
  return digits.replace(/(.{4})(?=.)/g, '$1-');
}

/** Clase CSS compartida para los campos de texto del formulario. */
const fieldClass =
  'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors';

// ---------------------------------------------------------------------------
// Props del componente
// ---------------------------------------------------------------------------

export interface PaymentDetailsEditorProps {
  /**
   * IDs de los métodos que están activos al montar. Determina qué toggles
   * aparecen activados en el acordeón.
   */
  initialMethods: string[];
  /**
   * JSONB tal como viene de la BD (forma vieja — objeto suelto — o nueva — lista).
   * El componente normaliza internamente con `entriesOf`.
   */
  initialDetails: Record<string, unknown>;
  /**
   * Función que el componente llama al hacer clic en "Guardar".
   * Recibe la lista de métodos activos y el JSONB listo para guardar.
   * El componente no llama `showToast` — la decisión de feedback pertenece al
   * contexto del padre.
   */
  onSave: (
    methods: string[],
    details: Record<string, unknown>,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Título de la sección. Por defecto "Métodos de pago aceptados". */
  title?: string;
  /** Descripción debajo del título. */
  description?: string;
  /** Texto del botón de guardado. Por defecto "Guardar métodos y datos". */
  saveLabel?: string;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function PaymentDetailsEditor({
  initialMethods,
  initialDetails,
  onSave,
  title = 'Métodos de pago aceptados',
  description = 'Activá los métodos que usás y expandí cada uno para configurar sus datos.',
  saveLabel = 'Guardar métodos y datos',
}: PaymentDetailsEditorProps) {
  // Estado interno: qué métodos están activos.
  const [activeMethods, setActiveMethods] = useState<string[]>(initialMethods);

  // Estado interno: datos por método, SIEMPRE como lista (normalizados desde la BD).
  const [details, setDetails] = useState<Record<string, PaymentEntry[]>>(() =>
    Object.fromEntries(
      PAYMENT_METHODS.map((m) => {
        const guardadas = entriesOf(initialDetails, m.id);
        return [m.id, guardadas.length > 0 ? guardadas : [{}]];
      }),
    ),
  );

  // Acordeón: métodos activos se pre-expanden al montar.
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initialMethods));

  // Feedback del botón de guardado.
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Manejadores de estado
  // ---------------------------------------------------------------------------

  function toggleMethod(id: string) {
    setActiveMethods((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  function updateField(methodId: string, index: number, field: string, value: string) {
    setDetails((prev) => {
      const lista = prev[methodId] ?? [{}];
      return {
        ...prev,
        [methodId]: lista.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
      };
    });
  }

  function addEntry(methodId: string) {
    setDetails((prev) => ({ ...prev, [methodId]: [...(prev[methodId] ?? [{}]), {}] }));
  }

  /**
   * Quita una entrada. Si era la última, deja un objeto vacío para que el
   * campo siga visible sin tener que reactivar el método.
   */
  function removeEntry(methodId: string, index: number) {
    setDetails((prev) => {
      const restantes = (prev[methodId] ?? []).filter((_, i) => i !== index);
      return { ...prev, [methodId]: restantes.length > 0 ? restantes : [{}] };
    });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Guardado
  // ---------------------------------------------------------------------------

  async function handleSave() {
    setSaveError(null);

    // Validación: si Transferencia está activa, cada N° de cuenta debe tener 20 dígitos.
    if (activeMethods.includes('transferencia')) {
      const cuentas = details['transferencia'] ?? [];
      for (let i = 0; i < cuentas.length; i++) {
        const acc = (cuentas[i]?.account ?? '').replace(/\D/g, '');
        if (acc.length > 0 && acc.length !== 20) {
          const msg =
            cuentas.length > 1
              ? `La cuenta ${i + 1} debe tener 20 dígitos (van ${acc.length}).`
              : `El N° de cuenta debe tener 20 dígitos (van ${acc.length}).`;
          setSaveError(msg);
          return;
        }
      }
    }

    // Serializar a la forma que entiende la BD.
    const detallesParaGuardar = Object.entries(details).reduce<Record<string, unknown>>(
      (acc, [metodo, entradas]) => withEntries(acc, metodo, entradas),
      {},
    );

    setSaving(true);
    try {
      const result = await onSave(activeMethods, detallesParaGuardar);
      if (!result.ok) {
        setSaveError(result.error ?? 'No se pudo guardar.');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <p className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1">{title}</p>
      <p className="text-xs text-slate-500 mb-4">{description}</p>

      <div className="space-y-2">
        {PAYMENT_METHODS.map((method) => {
          const active = activeMethods.includes(method.id);
          const hasFields = method.fields.length > 0;
          const isExpanded = active && hasFields && expanded.has(method.id);

          return (
            <div
              key={method.id}
              className={`border rounded-xl overflow-hidden transition-colors ${
                active ? 'border-teal-300 bg-teal-50/20' : 'border-slate-200 bg-white'
              }`}
            >
              {/* Fila de encabezado: toggle de activación + nombre + chevron */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    toggleMethod(method.id);
                    // Al activar: expandir si tiene campos.
                    // Al desactivar: colapsar.
                    if (!active && hasFields) {
                      setExpanded((prev) => new Set([...prev, method.id]));
                    } else if (active) {
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        next.delete(method.id);
                        return next;
                      });
                    }
                  }}
                  className="flex items-center gap-3 flex-1 text-left min-w-0"
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={active}
                    aria-hidden="true"
                    className="w-5 h-5 rounded border-slate-300 text-teal-500 pointer-events-none shrink-0"
                  />
                  <span className="text-xl shrink-0" aria-hidden="true">
                    {method.emoji}
                  </span>
                  <span className="text-sm font-medium text-slate-700 truncate">
                    {method.label}
                  </span>
                  {active && hasFields && !isExpanded && (
                    <span className="text-[10px] font-bold text-teal-600 bg-teal-100 px-2 py-0.5 rounded-full shrink-0">
                      Activo
                    </span>
                  )}
                </button>

                {/* Chevron expandir/colapsar — solo si tiene campos */}
                {hasFields && (
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={`payment-fields-${method.id}`}
                    aria-label={`${isExpanded ? 'Colapsar' : 'Expandir'} campos de ${method.label}`}
                    onClick={() => {
                      if (!active) {
                        // Activar el método al intentar expandir desde inactivo
                        toggleMethod(method.id);
                        setExpanded((prev) => new Set([...prev, method.id]));
                      } else {
                        toggleExpand(method.id);
                      }
                    }}
                    className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                      active
                        ? 'text-teal-600 hover:bg-teal-100'
                        : 'text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>

              {/* Panel de campos */}
              {isExpanded && (
                <div
                  id={`payment-fields-${method.id}`}
                  className="px-4 pb-4 pt-1 space-y-4 border-t border-teal-100"
                >
                  {(details[method.id] ?? [{}]).map((entrada, idx) => {
                    const entradas = details[method.id] ?? [{}];
                    const varias = entradas.length > 1;

                    return (
                      <div
                        key={idx}
                        className={varias ? 'rounded-lg border border-slate-200 p-3 space-y-2' : ''}
                      >
                        {varias && (
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                              {method.id === 'transferencia'
                                ? `Cuenta ${idx + 1}`
                                : `Opción ${idx + 1}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeEntry(method.id, idx)}
                              className="text-[11px] font-semibold text-slate-400 hover:text-red-600"
                            >
                              Quitar
                            </button>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {method.fields.map((f) => {
                            const isBankAccount =
                              method.id === 'transferencia' && f.key === 'account';
                            const rawVal = entrada[f.key] ?? '';
                            const accountDigits = isBankAccount ? rawVal.replace(/\D/g, '') : '';
                            const accountError =
                              isBankAccount &&
                              accountDigits.length > 0 &&
                              accountDigits.length !== 20
                                ? `La cuenta debe tener 20 dígitos (van ${accountDigits.length})`
                                : null;

                            return (
                              <div key={f.key}>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                  {f.label}
                                </label>
                                <input
                                  type={f.type ?? 'text'}
                                  inputMode={isBankAccount ? 'numeric' : undefined}
                                  value={rawVal}
                                  onChange={(e) =>
                                    updateField(
                                      method.id,
                                      idx,
                                      f.key,
                                      isBankAccount
                                        ? formatBankAccount(e.target.value)
                                        : e.target.value,
                                    )
                                  }
                                  placeholder={
                                    isBankAccount ? '0000-0000-0000-0000-0000' : f.placeholder
                                  }
                                  className={
                                    accountError
                                      ? fieldClass.replace('border-slate-200', 'border-red-300')
                                      : fieldClass
                                  }
                                />
                                {accountError && (
                                  <p className="text-[11px] text-red-600 mt-1">{accountError}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/*
                    Solo pago móvil y transferencia admiten varios juegos:
                    son los que un vendedor/especialista tiene en más de un banco.
                  */}
                  {MULTI_ENTRY_METHODS.has(method.id) && (
                    <button
                      type="button"
                      onClick={() => addEntry(method.id)}
                      className="text-xs font-semibold text-teal-600 hover:text-teal-700"
                    >
                      + Agregar {method.id === 'transferencia' ? 'otra cuenta' : 'otro pago móvil'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {saveError && (
        <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {saveError}
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="mt-6 flex items-center gap-2 g-bg px-5 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Guardando…
          </>
        ) : saved ? (
          <>
            <CheckCircle className="w-4 h-4" />
            Guardado
          </>
        ) : (
          <>
            <SaveIcon className="w-4 h-4" />
            {saveLabel}
          </>
        )}
      </button>
    </div>
  );
}
