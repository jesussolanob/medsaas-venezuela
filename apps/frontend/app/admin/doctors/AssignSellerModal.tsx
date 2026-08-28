'use client';

/**
 * AssignSellerModal
 *
 * Permite asignar o reasignar un especialista a un vendedor desde el panel admin.
 *
 * Reglas (ADR-046 / ADR-047):
 *   - El admin puede asignar CUALQUIER especialista a CUALQUIER vendedor.
 *   - La asignación vía admin NO genera comisión de entrada (sold_by_source = 'admin').
 *   - Solo se genera comisión cuando el especialista pasa a un PLAN PAGO después.
 *   - Lo ya generado queda con el vendedor anterior — reasignar no mueve comisiones pasadas.
 *   - Si el especialista ya tiene vendedor, se muestra un modal de reconfirmación
 *     con el cambio de quién → a quién antes de escribir.
 *
 * El vendedor actual sale de `GET /api/admin/specialist-assignment/:specialistId`,
 * que lo lee de la BD. ⚠️ Antes se INFERÍA buscando comisiones pendientes, y eso
 * tenía un agujero grave: a un especialista con todas las comisiones ya pagadas
 * —o sin ninguna— se le pisaba la atribución sin mostrar la reconfirmación.
 */

import { useEffect, useState } from 'react';
import { X, Loader2, AlertTriangle, Users, UserCheck, Info } from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SellerOption {
  id: string;
  fullName: string;
  sellerCode: string;
}

type ModalStep = 'select' | 'reconfirm';

interface AssignSellerModalProps {
  /** UUID del especialista a asignar. */
  specialistId: string;
  /** Nombre del especialista para mostrar en el modal. */
  specialistName: string;
  onClose: () => void;
  onSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Helpers de carga
// ---------------------------------------------------------------------------

async function loadSellers(): Promise<SellerOption[]> {
  const res = await fetch('/api/admin/sellers', { cache: 'no-store' });
  if (!res.ok) throw new Error('No se pudo cargar la lista de vendedores.');
  const json = (await res.json()) as {
    success?: boolean;
    data?: { id: string; fullName: string; sellerCode: string }[];
    error?: string;
  };
  if (!json.success) throw new Error(json.error ?? 'Error al cargar vendedores.');
  return (json.data ?? []).map((s) => ({
    id: s.id,
    fullName: s.fullName,
    sellerCode: s.sellerCode,
  }));
}

/**
 * Devuelve el vendedor actual del especialista, leído de la BD.
 *
 * ⚠️ Esto ANTES se adivinaba buscando comisiones pendientes, porque era lo único
 * que relacionaba especialistas con vendedores. Tenía un agujero grave: si al
 * especialista ya se le habían pagado todas las comisiones, o nunca generó
 * ninguna, devolvía null — **el modal de reconfirmación no aparecía y la
 * atribución se pisaba en silencio**, que es justo lo que el dueño pidió evitar.
 * No volver a inferirlo: hay endpoint propio.
 */
async function fetchCurrentSeller(
  specialistId: string,
): Promise<{ sellerId: string; sellerName: string } | null> {
  try {
    const res = await fetch(
      `/api/admin/specialist-assignment/${encodeURIComponent(specialistId)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;

    const json = (await res.json()) as {
      success?: boolean;
      data?: { sellerId: string | null; sellerName: string | null };
    };

    const d = json.data;
    if (!json.success || !d?.sellerId) return null;

    return { sellerId: d.sellerId, sellerName: d.sellerName ?? 'vendedor sin nombre' };
  } catch {
    return null;
  }
}

async function callAssign(specialistId: string, sellerId: string): Promise<void> {
  const res = await fetch('/api/admin/seller-commissions/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ specialist_id: specialistId, seller_id: sellerId }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
  };

  if (!res.ok || !json.success) {
    throw new Error(json.error ?? 'No se pudo asignar el vendedor.');
  }
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function AssignSellerModal({
  specialistId,
  specialistName,
  onClose,
  onSuccess,
}: AssignSellerModalProps) {
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [currentSeller, setCurrentSeller] = useState<{
    sellerId: string;
    sellerName: string;
  } | null>(null);

  const [step, setStep] = useState<ModalStep>('select');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;

    async function init() {
      try {
        const [sellerList, current] = await Promise.all([
          loadSellers(),
          fetchCurrentSeller(specialistId),
        ]);
        if (!alive) return;
        setSellers(sellerList);
        setCurrentSeller(current);
      } catch (err: unknown) {
        if (!alive) return;
        const msg = err instanceof Error ? err.message : 'Error al cargar datos.';
        setLoadError(msg);
      } finally {
        if (alive) setLoadingData(false);
      }
    }

    void init();
    return () => {
      alive = false;
    };
  }, [specialistId]);

  const selectedSeller = sellers.find((s) => s.id === selectedSellerId) ?? null;

  /**
   * Se requiere reconfirmación cuando:
   *   - detectamos un vendedor actual (via comisiones pendientes)
   *   - el admin eligió un vendedor distinto al actual
   */
  const willReassign =
    currentSeller !== null &&
    selectedSellerId !== '' &&
    selectedSellerId !== currentSeller.sellerId;

  function handlePrimaryClick() {
    if (!selectedSellerId) return;

    if (willReassign && step === 'select') {
      // Ir al paso de reconfirmación para mostrar "de quién → a quién"
      setStep('reconfirm');
      return;
    }

    // Primer vendor asignado (sin vendedor previo conocido) o ya en el paso de reconfirmación
    void submitAssignment();
  }

  async function submitAssignment() {
    setSubmitting(true);
    try {
      await callAssign(specialistId, selectedSellerId);

      showToast({
        type: 'success',
        message: `${specialistName} fue asignado a ${selectedSeller?.fullName ?? 'vendedor'}.`,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al asignar el vendedor.';
      showToast({ type: 'error', message: msg });
      setStep('select');
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Paso 2: modal de reconfirmación (de quién → a quién)
  // ---------------------------------------------------------------------------

  if (step === 'reconfirm' && currentSeller && selectedSeller) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
          <div className="flex items-start justify-between p-5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">Reasignar vendedor</p>
                <p className="text-xs text-slate-500 mt-0.5">{specialistName}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Resumen del cambio: de quién → a quién */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Cambio de atribución
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide">
                    Antes
                  </p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">
                    {currentSeller.sellerName}
                  </p>
                </div>
                <span className="text-slate-400 font-bold text-lg">→</span>
                <div className="flex-1 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-teal-500 uppercase font-semibold tracking-wide">
                    Después
                  </p>
                  <p className="text-sm font-semibold text-teal-700 mt-0.5">
                    {selectedSeller.fullName}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Esto no se puede deshacer automáticamente
              </p>
              <ul className="text-sm text-amber-900 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                  <span>
                    <strong>Lo ya generado queda con {currentSeller.sellerName}:</strong> las
                    comisiones de este especialista hasta ahora no se mueven.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                  <span>
                    <strong>{selectedSeller.fullName} solo cobra de ahí en adelante</strong> y solo
                    si el especialista pasa a un plan pago.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                  <span>
                    Esta asignación vía admin <strong>no genera comisión de entrada</strong> para{' '}
                    {selectedSeller.fullName}.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="flex gap-2 p-5 pt-0">
            <button
              type="button"
              onClick={() => setStep('select')}
              disabled={submitting}
              className="flex-1 border border-slate-200 rounded-lg py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={() => void submitAssignment()}
              disabled={submitting}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg py-2.5 disabled:opacity-50 transition-colors"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmar reasignación
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Paso 1: modal de selección de vendedor
  // ---------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Asignar a vendedor</p>
              <p className="text-xs text-slate-500 mt-0.5">{specialistName}</p>
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

        {/* Body */}
        <div className="p-5 space-y-4">
          {loadingData ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando vendedores…
            </div>
          ) : loadError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
              {loadError}
            </div>
          ) : sellers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Users className="w-8 h-8 text-slate-300" />
              <p className="text-sm text-slate-500">
                No hay vendedores registrados. Creá uno primero desde la pantalla de vendedores.
              </p>
            </div>
          ) : (
            <>
              {/* Vendedor actual detectado */}
              {currentSeller && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-600">
                    Vendedor actual:{' '}
                    <span className="font-semibold text-slate-800">{currentSeller.sellerName}</span>
                  </p>
                </div>
              )}

              {/* Select de vendedor */}
              <div>
                <label
                  htmlFor="assign-seller-select"
                  className="block text-xs font-semibold text-slate-600 mb-1.5"
                >
                  {currentSeller ? 'Nuevo vendedor' : 'Seleccionar vendedor'}{' '}
                  <span className="text-red-400">*</span>
                </label>
                <select
                  id="assign-seller-select"
                  value={selectedSellerId}
                  onChange={(e) => setSelectedSellerId(e.target.value)}
                  className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 transition-colors bg-white"
                >
                  <option value="">— Elegí un vendedor —</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.sellerCode})
                    </option>
                  ))}
                </select>
              </div>

              {/* Aviso de reglas de comisión */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  Cómo aplican las comisiones
                </p>
                <ul className="text-sm text-blue-900 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                    <span>
                      Esta asignación (lead de Ads o directo){' '}
                      <strong>no genera comisión de entrada</strong>. Solo la pagan las altas por
                      código del vendedor o desde su portal.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                    <span>
                      El vendedor asignado cobra cuando el especialista{' '}
                      <strong>pase a un plan pago</strong> después de esta asignación.
                    </span>
                  </li>
                  {currentSeller && (
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                      <span>
                        <strong>Lo ya generado queda con el vendedor anterior.</strong> Reasignar no
                        mueve comisiones pasadas.
                      </span>
                    </li>
                  )}
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loadingData && !loadError && sellers.length > 0 && (
          <div className="flex gap-2 p-5 pt-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 border border-slate-200 rounded-lg py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handlePrimaryClick}
              disabled={submitting || !selectedSellerId}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg py-2.5 disabled:opacity-40 transition-colors"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {willReassign ? 'Revisar reasignación' : 'Asignar vendedor'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
