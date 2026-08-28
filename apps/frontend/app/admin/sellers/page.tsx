'use client';

/**
 * /admin/sellers — gestión de vendedores (SOLO super_admin).
 *
 * Consume el BFF thin-proxy:
 *   GET  /api/admin/sellers  → lista con código, conteo de especialistas e isActive
 *   POST /api/admin/sellers  → alta (el backend genera el código)
 *   PUT  /api/admin/doctors/[id]/access → deshabilitar / habilitar (genérico por profiles.is_active)
 *
 * El RBAC lo aplica el backend (`@Roles('super_admin')`). Acá no se re-decide
 * quién entra: si responde 403 se muestra el aviso y punto.
 *
 * OJO con las formas del wire (nos mordió antes): el GET devuelve camelCase
 * tal como lo serializa NestJS, y el POST espera `fullName` porque la ruta del
 * BFF es la que traduce a `full_name` para el backend.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Plus,
  Loader2,
  Copy,
  Check,
  ShieldAlert,
  Mail,
  ShieldOff,
  ShieldCheck,
  X,
  AlertTriangle,
  CreditCard,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import SellerPaymentDetailsModal from './SellerPaymentDetailsModal';

interface SellerRow {
  id: string;
  fullName: string;
  email: string;
  sellerCode: string;
  specialistsCount: number;
  isActive: boolean;
  createdAt: string;
  lastSignInAt: string | null;
}

/** Resultado del fetch, sin tocar estado — así el efecto queda libre de setState. */
type FetchResult =
  | { kind: 'ok'; rows: SellerRow[] }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string };

async function fetchSellers(): Promise<FetchResult> {
  try {
    const res = await fetch('/api/admin/sellers', { cache: 'no-store' });
    // 403 = no es super_admin. Se distingue de un error cualquiera.
    if (res.status === 403) return { kind: 'forbidden' };

    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: SellerRow[];
      error?: string;
    };
    if (!res.ok || !json.success) {
      return { kind: 'error', message: json.error ?? 'No se pudo cargar la lista de vendedores.' };
    }
    return { kind: 'ok', rows: json.data ?? [] };
  } catch {
    return { kind: 'error', message: 'Error de conexión al cargar los vendedores.' };
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Modal de confirmación para deshabilitar / habilitar un vendedor
// ---------------------------------------------------------------------------

interface AccessConfirmModalProps {
  seller: SellerRow;
  /** true = actualmente habilitado → confirmamos DESHABILITAR; false → HABILITAR */
  currentlyActive: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

function AccessConfirmModal({
  seller,
  currentlyActive,
  onConfirm,
  onCancel,
}: AccessConfirmModalProps) {
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }

  if (currentlyActive) {
    // Confirmación para DESHABILITAR — explicamos consecuencias reales (ADR-046)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
          <div className="flex items-start justify-between p-5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <ShieldOff className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">Deshabilitar vendedor</p>
                <p className="text-xs text-slate-500 mt-0.5">{seller.fullName}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <p className="text-xs font-bold uppercase tracking-wide">Consecuencias reales</p>
              </div>
              <ul className="space-y-1.5 text-sm text-amber-900">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-500 shrink-0">•</span>
                  <span>
                    Su <strong>enlace de referido dejará de atribuir</strong> especialistas nuevos.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-500 shrink-0">•</span>
                  <span>
                    <strong>No generará comisiones nuevas</strong> mientras esté deshabilitado.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-500 shrink-0">•</span>
                  <span>
                    <strong>Lo que ya se le debe se le sigue debiendo:</strong> deshabilitar no le
                    borra las comisiones pendientes.
                  </span>
                </li>
              </ul>
            </div>

            <p className="text-sm text-slate-600">
              Podés volver a habilitarlo en cualquier momento desde esta pantalla.
            </p>
          </div>

          <div className="flex gap-2 p-5 pt-0">
            <button
              type="button"
              onClick={onCancel}
              disabled={confirming}
              className="flex-1 border border-slate-200 rounded-lg py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={confirming}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg py-2.5 disabled:opacity-50 transition-colors"
            >
              {confirming && <Loader2 className="w-4 h-4 animate-spin" />}
              Deshabilitar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Confirmación para HABILITAR
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Habilitar vendedor</p>
              <p className="text-xs text-slate-500 mt-0.5">{seller.fullName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm text-slate-600">
            Al habilitarlo, su enlace de referido volverá a atribuir especialistas nuevos y podrá
            generar comisiones de nuevo.
          </p>
        </div>

        <div className="flex gap-2 p-5 pt-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 border border-slate-200 rounded-lg py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={confirming}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg py-2.5 disabled:opacity-50 transition-colors"
          >
            {confirming && <Loader2 className="w-4 h-4 animate-spin" />}
            Habilitar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function SellersPage() {
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  /** 403 → el usuario no es super_admin. Se distingue de un error cualquiera. */
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  /** Vendedor cuyo modal de confirmación está abierto, y si se va a deshabilitar. */
  const [accessModal, setAccessModal] = useState<{
    seller: SellerRow;
    currentlyActive: boolean;
  } | null>(null);

  /** Vendedor cuyo modal de datos de cobro está abierto. */
  const [paymentModal, setPaymentModal] = useState<SellerRow | null>(null);

  /**
   * Aplica el resultado del fetch al estado. Separado del efecto a propósito:
   * llamar setState directo dentro de un useEffect lo marca el linter
   * (react-hooks/set-state-in-effect), así que el efecto solo espera el await.
   */
  const apply = useCallback((r: FetchResult) => {
    if (r.kind === 'forbidden') setForbidden(true);
    else if (r.kind === 'error') setLoadError(r.message);
    else setSellers(r.rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await fetchSellers();
      if (alive) apply(r);
    })();
    return () => {
      alive = false;
    };
  }, [apply]);

  /** Recarga explícita: botón "Reintentar" y después de crear un vendedor. */
  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    apply(await fetchSellers());
  }, [apply]);

  async function handleToggleAccess() {
    const modal = accessModal;
    if (!modal) return;

    const newIsActive = !modal.currentlyActive;

    try {
      const res = await fetch(`/api/admin/doctors/${modal.seller.id}/access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newIsActive }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { id: string; isActive: boolean };
        error?: string;
      };

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'No se pudo actualizar el acceso del vendedor.');
      }

      const confirmedActive = json.data?.isActive ?? newIsActive;
      showToast({
        type: 'success',
        message: confirmedActive
          ? `${modal.seller.fullName} fue habilitado.`
          : `${modal.seller.fullName} fue deshabilitado.`,
      });

      // Recargamos el listado para que isActive refleje la BD, no la memoria local.
      await reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar el acceso.';
      showToast({ type: 'error', message: msg });
    } finally {
      setAccessModal(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;

    setSaving(true);
    try {
      const res = await fetch('/api/admin/sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: { sellerCode?: string };
      };

      if (!res.ok || !json.success) {
        showToast({
          type: 'error',
          message: json.error ?? 'No se pudo dar de alta al vendedor.',
        });
        return;
      }

      showToast({
        type: 'success',
        message: json.data?.sellerCode
          ? `Vendedor creado. Su código es ${json.data.sellerCode}`
          : 'Vendedor creado',
      });
      setFullName('');
      setEmail('');
      setShowForm(false);
      await reload();
    } catch {
      showToast({ type: 'error', message: 'Error de conexión al crear el vendedor.' });
    } finally {
      setSaving(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1800);
    } catch {
      showToast({ type: 'error', message: 'No se pudo copiar el código.' });
    }
  }

  if (forbidden) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-white border border-slate-200 rounded-xl p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Solo para super administradores</h1>
        <p className="text-sm text-slate-500 mt-2">
          La gestión de vendedores está reservada al super administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {accessModal && (
        <AccessConfirmModal
          seller={accessModal.seller}
          currentlyActive={accessModal.currentlyActive}
          onConfirm={handleToggleAccess}
          onCancel={() => setAccessModal(null)}
        />
      )}

      {paymentModal && (
        <SellerPaymentDetailsModal
          sellerId={paymentModal.id}
          sellerName={paymentModal.fullName}
          onClose={() => setPaymentModal(null)}
        />
      )}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vendedores</h1>
          <p className="text-sm text-slate-500 mt-1">
            Cada vendedor tiene un código propio. Los especialistas que lo usen al registrarse
            quedan asociados a él.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo vendedor
        </button>
      </header>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <p className="text-sm font-semibold text-slate-800">Dar de alta un vendedor</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="seller-name"
                className="block text-xs font-semibold text-slate-600 mb-1.5"
              >
                Nombre completo <span className="text-red-400">*</span>
              </label>
              <input
                id="seller-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
                maxLength={300}
                placeholder="Ej: María Rodríguez"
                className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor="seller-email"
                className="block text-xs font-semibold text-slate-600 mb-1.5"
              >
                Correo <span className="text-red-400">*</span>
              </label>
              <input
                id="seller-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={320}
                placeholder="vendedor@ejemplo.com"
                className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 transition-colors"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            El código del vendedor lo genera el sistema: no se elige a mano.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={saving}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !fullName.trim() || !email.trim()}
              className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-40 transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Crear vendedor
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando vendedores…
        </div>
      ) : loadError ? (
        <div className="bg-white border border-red-200 rounded-xl p-6 text-center">
          <p className="text-sm text-red-600">{loadError}</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-3 text-sm font-semibold text-teal-600 hover:text-teal-700"
          >
            Reintentar
          </button>
        </div>
      ) : sellers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-800">Todavía no hay vendedores</p>
          <p className="text-sm text-slate-500 mt-1">
            Creá el primero para que empiece a registrar especialistas con su código.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase">Vendedor</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase">Código</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase">Estado</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase text-right">
                    Especialistas
                  </th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase">Alta</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase">
                    Último ingreso
                  </th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase">Cobro</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase">Acceso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sellers.map((s) => {
                  const active = s.isActive;
                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-slate-50/70 transition-colors ${!active ? 'opacity-60' : ''}`}
                    >
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-800">{s.fullName}</p>
                        <p className="text-xs text-slate-400 inline-flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3" />
                          {s.email}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => void copyCode(s.sellerCode)}
                          title="Copiar código"
                          className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1 hover:bg-teal-100 transition-colors"
                        >
                          {s.sellerCode || '—'}
                          {copiedCode === s.sellerCode ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        {active ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                            <ShieldCheck className="w-3 h-3" />
                            Habilitado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-1">
                            <ShieldOff className="w-3 h-3" />
                            Deshabilitado
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-700">
                        {s.specialistsCount}
                      </td>
                      <td className="px-5 py-3 text-slate-500">{formatDate(s.createdAt)}</td>
                      <td className="px-5 py-3 text-slate-500">
                        {s.lastSignInAt ? (
                          formatDate(s.lastSignInAt)
                        ) : (
                          <span className="text-xs text-slate-400">Nunca entró</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => setPaymentModal(s)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          <CreditCard className="w-3 h-3" />
                          Ver cobro
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => setAccessModal({ seller: s, currentlyActive: active })}
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border transition-colors ${
                            active
                              ? 'border-red-200 text-red-600 hover:bg-red-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {active ? (
                            <>
                              <ShieldOff className="w-3 h-3" />
                              Deshabilitar
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-3 h-3" />
                              Habilitar
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
