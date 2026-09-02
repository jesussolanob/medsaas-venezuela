'use client';

/**
 * /admin/comisiones — Pago de comisiones a vendedores (SOLO super_admin).
 *
 * Muestra los vendedores con comisiones pendientes, permite seleccionar cuáles
 * pagar (total o subconjunto) y registrar el pago con método y referencia.
 *
 * El monto nunca sale del cliente: el servidor lo calcula releyendo las
 * comisiones seleccionadas dentro de una transacción con lock de fila.
 *
 * Reglas del dominio que la pantalla respeta:
 *   - Cada especialista genera como máximo 2 comisiones:
 *     "Entrada" ($10 al completar el onboarding) y "Plan" ($10 Base / $20 Plus).
 *   - El pago es IRREVERSIBLE desde la UI (no hay endpoint de reversión).
 *   - El admin puede pagar un subconjunto de comisiones por vendedor;
 *     el total seleccionado se actualiza en tiempo real con los checkboxes.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  Handshake,
  Loader2,
  CheckSquare,
  Square,
  AlertTriangle,
  ExternalLink,
  History,
  ClipboardList,
  ShieldAlert,
  Upload,
  FileCheck,
} from 'lucide-react';
import { clsx } from 'clsx';
import { showToast } from '@/components/ui/Toaster';
import {
  activeMethodsOf,
  entriesOf,
  entryLabel,
  fieldLabel,
  methodLabel,
  type PaymentDetails,
} from '@/lib/payment-details';

// ---------------------------------------------------------------------------
// Types (mirror controller DTOs — all camelCase)
// ---------------------------------------------------------------------------

/** pending = sin revisar · approved = habilitada para pago · paid = liquidada. */
type CommissionStatus = 'pending' | 'approved' | 'paid';

interface PendingCommissionItem {
  commissionId: string;
  specialistId: string;
  specialistName: string;
  type: 'signup' | 'plan';
  amountUsd: number;
  planKey: string | null;
  earnedAt: string;
  /** Nunca llega 'paid' acá: esta lista es de lo NO pagado. */
  status: CommissionStatus;
}

interface PendingBySeller {
  sellerId: string;
  sellerName: string;
  /** Lo NO pagado: pendientes + aprobadas. Aprobar no salda la deuda. */
  totalPendingUsd: number;
  pendingCount: number;
  /** Cuántas están aprobadas — las únicas que se pueden pagar hoy. */
  approvedCount: number;
  totalApprovedUsd: number;
  commissions: PendingCommissionItem[];
}

interface SellerPaymentRow {
  id: string;
  sellerId: string;
  amountUsd: number;
  /**
   * Tasa BCV (Bs por USD) vigente al momento de registrar el pago.
   * null → tasa no estaba disponible o el pago es anterior a este campo.
   * Mostrar solo USD cuando es null.
   */
  bcvRate: number | null;
  method: string;
  reference: string;
  receiptUrl: string | null;
  notes: string | null;
  paidAt: string;
  createdBy: string;
  createdAt: string;
}

type TabKind = 'commissions' | 'history';

interface PayForm {
  method: string;
  reference: string;
  notes: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Acá había un PAYMENT_METHODS fijo con todos los métodos del sistema. Los
// métodos ahora salen de los datos de cobro del vendedor (activeMethodsOf):
// ofrecer uno que el vendedor no configuró no sirve para pagarle.

const EMPTY_PAY_FORM: PayForm = {
  method: '',
  reference: '',
  notes: '',
};

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Formatea bolívares sin decimales. Devuelve string con prefijo "Bs." */
function fmtBs(amountUsd: number, rate: number): string {
  return `Bs. ${(amountUsd * rate).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getCommissionLabel(type: 'signup' | 'plan', planKey: string | null): string {
  if (type === 'signup') return 'Entrada';
  if (planKey === 'delta_plus') return 'Plan Plus';
  if (planKey === 'delta_base') return 'Plan Base';
  return planKey ?? 'Plan';
}

function getCommissionBadgeClass(type: 'signup' | 'plan', planKey: string | null): string {
  if (type === 'signup') return 'bg-teal-50 text-teal-700 border border-teal-200';
  if (planKey === 'delta_plus') return 'bg-violet-50 text-violet-700 border border-violet-200';
  return 'bg-blue-50 text-blue-700 border border-blue-200';
}

function calcSelectedTotal(commissions: PendingCommissionItem[], selectedIds: Set<string>): number {
  return commissions
    .filter((c) => selectedIds.has(c.commissionId))
    .reduce((acc, c) => acc + c.amountUsd, 0);
}

// ---------------------------------------------------------------------------
// Fetch helpers — call the BFF, not the backend directly
// ---------------------------------------------------------------------------

async function fetchPending(): Promise<
  | { kind: 'ok'; sellers: PendingBySeller[]; bcvRate: number | null }
  | { kind: 'error'; message: string }
> {
  try {
    const res = await fetch('/api/admin/seller-commissions/pending', { cache: 'no-store' });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      // ⚠️ BREAKING CHANGE (2026-08-28): data ahora es { bcvRate, sellers }, no un array pelado.
      data?: { bcvRate?: number | null; sellers?: PendingBySeller[] };
      error?: string;
    };
    if (!res.ok || !json.success) {
      return {
        kind: 'error',
        message: json.error ?? 'No se pudo cargar las comisiones pendientes.',
      };
    }
    return {
      kind: 'ok',
      bcvRate: json.data?.bcvRate ?? null,
      sellers: Array.isArray(json.data?.sellers) ? json.data.sellers : [],
    };
  } catch {
    return { kind: 'error', message: 'Error de conexión al cargar las comisiones.' };
  }
}

async function fetchHistory(
  sellerId: string,
): Promise<{ kind: 'ok'; payments: SellerPaymentRow[] } | { kind: 'error'; message: string }> {
  try {
    const res = await fetch(`/api/admin/seller-commissions/payments/${sellerId}`, {
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: SellerPaymentRow[];
      error?: string;
    };
    if (!res.ok || !json.success) {
      return { kind: 'error', message: json.error ?? 'No se pudo cargar el historial.' };
    }
    return { kind: 'ok', payments: json.data ?? [] };
  } catch {
    return { kind: 'error', message: 'Error de conexión al cargar el historial.' };
  }
}

async function submitPayment(payload: {
  seller_id: string;
  commission_ids: string[];
  method: string;
  reference: string;
  receipt_url?: string;
  notes?: string;
}): Promise<{ kind: 'ok'; amountUsd: number } | { kind: 'error'; message: string }> {
  try {
    const body: Record<string, unknown> = {
      seller_id: payload.seller_id,
      commission_ids: payload.commission_ids,
      method: payload.method,
      reference: payload.reference,
    };
    if (payload.receipt_url) body.receipt_url = payload.receipt_url;
    if (payload.notes) body.notes = payload.notes;

    const res = await fetch('/api/admin/seller-commissions/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { amountUsd: number };
      error?: string;
    };
    if (!res.ok || !json.success) {
      return { kind: 'error', message: json.error ?? 'No se pudo registrar el pago.' };
    }
    return { kind: 'ok', amountUsd: json.data?.amountUsd ?? 0 };
  } catch {
    return { kind: 'error', message: 'Error de conexión al registrar el pago.' };
  }
}

/**
 * Uploads a receipt file to storage. Returns the path (NOT the signed URL) so
 * it can be stored in seller_payments.receipt_url. The signed URL is requested
 * on-demand via the BFF to avoid embedding expiring links in the DOM.
 */
async function uploadReceiptFile(
  file: File,
): Promise<{ kind: 'ok'; path: string } | { kind: 'error'; message: string }> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('kind', 'receipt');
  try {
    const res = await fetch('/api/storage/upload', { method: 'POST', body: fd });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { url: string; path: string };
      error?: { message?: string } | string;
    };
    if (!res.ok || !json.success) {
      const msg =
        typeof json.error === 'object' ? json.error?.message : (json.error as string | undefined);
      return { kind: 'error', message: msg ?? 'No se pudo subir el comprobante.' };
    }
    if (!json.data?.path) {
      return { kind: 'error', message: 'El servidor no devolvió la ruta del comprobante.' };
    }
    return { kind: 'ok', path: json.data.path };
  } catch {
    return { kind: 'error', message: 'Error de conexión al subir el comprobante.' };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ComisionesPage() {
  const [sellers, setSellers] = useState<PendingBySeller[]>([]);
  /** Tasa BCV actual (Bs por USD) para calcular equivalente de comisiones pendientes. */
  const [bcvRate, setBcvRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Which seller card is expanded
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Tabs per expanded seller
  const [activeTab, setActiveTab] = useState<TabKind>('commissions');
  // Commission checkboxes — IDs of selected commissions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);

  // History state
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<SellerPaymentRow[]>([]);
  const [historyLoadedFor, setHistoryLoadedFor] = useState<string | null>(null);

  // Payment form
  const [payStep, setPayStep] = useState<'none' | 'form' | 'submitting'>('none');
  const [payForm, setPayForm] = useState<PayForm>(EMPTY_PAY_FORM);
  const [payError, setPayError] = useState<string | null>(null);

  // Receipt file upload (form step)
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptUploadError, setReceiptUploadError] = useState<string | null>(null);

  // Opening a receipt from history (on-demand signed URL)
  const [fetchingReceiptId, setFetchingReceiptId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load pending sellers
  // ---------------------------------------------------------------------------

  /**
   * Applies a fetch result to state. Kept outside the effect so that the effect
   * only triggers the fetch — setState is not called directly inside the effect
   * body (avoids the react-hooks/set-state-in-effect lint rule).
   */
  const applyPending = useCallback((result: Awaited<ReturnType<typeof fetchPending>>) => {
    if (result.kind === 'error') {
      setLoadError(result.message);
    } else {
      const sorted = [...result.sellers].sort((a, b) => b.totalPendingUsd - a.totalPendingUsd);
      setSellers(sorted);
      setBcvRate(result.bcvRate);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await fetchPending();
      if (alive) applyPending(r);
    })();
    return () => {
      alive = false;
    };
  }, [applyPending]);

  /** Explicit reload — called from event handlers, not from within an effect. */
  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    applyPending(await fetchPending());
  }, [applyPending]);

  // ---------------------------------------------------------------------------
  // Expand / collapse seller card
  // ---------------------------------------------------------------------------

  function handleExpand(sellerId: string) {
    if (expandedId === sellerId) {
      // Collapse
      setExpandedId(null);
      setActiveTab('commissions');
      setSelectedIds(new Set());
      setPayStep('none');
      setPayError(null);
      return;
    }
    // Expand: pre-select all commissions for this seller
    setExpandedId(sellerId);
    setActiveTab('commissions');
    setPayStep('none');
    setPayError(null);
    const seller = sellers.find((s) => s.sellerId === sellerId);
    if (seller) {
      // Se preseleccionan las aprobadas: son las que se pueden pagar. Las
      // pendientes se marcan a mano para aprobarlas.
      setSelectedIds(
        new Set(
          seller.commissions.filter((c) => c.status === 'approved').map((c) => c.commissionId),
        ),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Tab change
  // ---------------------------------------------------------------------------

  async function handleTabChange(tab: TabKind, sellerId: string) {
    setActiveTab(tab);
    if (tab === 'history' && historyLoadedFor !== sellerId) {
      setHistoryLoading(true);
      setHistoryError(null);
      const result = await fetchHistory(sellerId);
      setHistoryLoadedFor(sellerId);
      if (result.kind === 'error') {
        setHistoryError(result.message);
      } else {
        setHistory(result.payments);
      }
      setHistoryLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Commission selection
  // ---------------------------------------------------------------------------

  function handleToggle(commissionId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(commissionId)) next.delete(commissionId);
      else next.add(commissionId);
      return next;
    });
  }

  function handleSelectAll(seller: PendingBySeller) {
    const allSelected = seller.commissions.every((c) => selectedIds.has(c.commissionId));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(seller.commissions.map((c) => c.commissionId)));
    }
  }

  // ---------------------------------------------------------------------------
  // Receipt file handling
  // ---------------------------------------------------------------------------

  async function handleReceiptFile(file: File) {
    if (!ACCEPTED_RECEIPT_TYPES.includes(file.type)) {
      setReceiptUploadError('El archivo debe ser JPEG, PNG, WebP o PDF.');
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setReceiptUploadError('El archivo no debe superar los 10 MB.');
      return;
    }
    setReceiptFile(file);
    setReceiptPath(null);
    setReceiptUploadError(null);
    setReceiptUploading(true);
    const result = await uploadReceiptFile(file);
    setReceiptUploading(false);
    if (result.kind === 'error') {
      setReceiptUploadError(result.message);
      setReceiptFile(null);
    } else {
      setReceiptPath(result.path);
    }
  }

  /**
   * Opens a payment receipt in a new tab by fetching a short-lived signed URL
   * on demand. We never use the stored path directly as an href — it's a GCS
   * storage path, not a public URL.
   */
  async function openReceipt(paymentId: string) {
    setFetchingReceiptId(paymentId);
    try {
      const res = await fetch(`/api/admin/seller-commissions/payments/${paymentId}/receipt-url`);
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? 'No se pudo obtener el comprobante.');
      window.open(j.url ?? '', '_blank', 'noopener,noreferrer');
    } catch (e: unknown) {
      showToast({
        type: 'error',
        message: e instanceof Error ? e.message : 'Error al abrir el comprobante.',
      });
    } finally {
      setFetchingReceiptId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Payment
  // ---------------------------------------------------------------------------

  function handleStartPay() {
    setPayStep('form');
    setPayError(null);
    setPayForm(EMPTY_PAY_FORM);
    setReceiptFile(null);
    setReceiptPath(null);
    setReceiptUploading(false);
    setReceiptUploadError(null);
  }

  function handleCancelPay() {
    setPayStep('none');
    setPayError(null);
  }

  /**
   * Aprueba las comisiones PENDIENTES que estén marcadas. No paga nada: las deja
   * habilitadas para el pago posterior.
   */
  async function handleApprove(seller: PendingBySeller) {
    const ids = seller.commissions
      .filter((c) => selectedIds.has(c.commissionId) && c.status === 'pending')
      .map((c) => c.commissionId);

    if (ids.length === 0) {
      setPayError('Marcá al menos una comisión pendiente para aprobar.');
      return;
    }

    setApproving(true);
    setPayError(null);
    try {
      const res = await fetch('/api/admin/seller-commissions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seller_id: seller.sellerId, commission_ids: ids }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setPayError(json.error ?? 'No se pudieron aprobar las comisiones.');
        return;
      }
      showToast({
        type: 'success',
        message:
          ids.length === 1
            ? 'Comisión aprobada. Ya se puede pagar.'
            : `${ids.length} comisiones aprobadas. Ya se pueden pagar.`,
      });
      setSelectedIds(new Set());
      await reload();
    } catch {
      setPayError('No se pudieron aprobar las comisiones.');
    } finally {
      setApproving(false);
    }
  }

  async function handleSubmitPay(seller: PendingBySeller) {
    if (!payForm.method || !payForm.reference.trim()) {
      setPayError('El método y la referencia son obligatorios.');
      return;
    }
    // Solo las APROBADAS. El backend rechaza el lote entero si viene una
    // pendiente, así que filtrar acá evita un error críptico por una casilla
    // que el admin marcó sin querer.
    const ids = seller.commissions
      .filter((c) => selectedIds.has(c.commissionId) && c.status === 'approved')
      .map((c) => c.commissionId);

    if (ids.length === 0) {
      setPayError('Seleccioná al menos una comisión aprobada para pagar.');
      return;
    }

    setPayStep('submitting');
    setPayError(null);

    const result = await submitPayment({
      seller_id: seller.sellerId,
      commission_ids: ids,
      method: payForm.method,
      reference: payForm.reference.trim(),
      // receipt_url holds the storage PATH (not a signed URL) — the backend
      // stores it and re-signs it on demand.
      ...(receiptPath ? { receipt_url: receiptPath } : {}),
      ...(payForm.notes.trim() ? { notes: payForm.notes.trim() } : {}),
    });

    if (result.kind === 'error') {
      setPayError(result.message);
      setPayStep('form');
      return;
    }

    // Success
    showToast({
      type: 'success',
      message: `Pago de ${formatUsd(result.amountUsd)} registrado para ${seller.sellerName}.`,
    });
    setPayStep('none');
    setPayError(null);
    setExpandedId(null);
    setSelectedIds(new Set());
    setHistoryLoadedFor(null);
    setReceiptFile(null);
    setReceiptPath(null);
    setReceiptUploadError(null);
    await reload();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const totalGlobalPending = sellers.reduce((acc, s) => acc + s.totalPendingUsd, 0);
  // La tasa sigue llegando y se usa en el formulario de pago (`hasBcv`), que es el
  // único lugar donde los bolívares son reales. Acá arriba ya no se convierte nada.

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Comisiones a vendedores</h1>
          <p className="text-sm text-slate-500 mt-1">
            Registrá los pagos de comisiones pendientes. Cada especialista genera como máximo dos
            comisiones: <span className="font-medium text-slate-700">Entrada</span> (al completar el
            onboarding) y <span className="font-medium text-slate-700">Plan</span> (al activar el
            primer plan pago).
          </p>
        </div>
      </header>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-16">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando comisiones pendientes…
        </div>
      )}

      {/* Error */}
      {!loading && loadError && (
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
      )}

      {/* Empty state */}
      {!loading && !loadError && sellers.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-400 flex items-center justify-center mx-auto mb-5">
            <Handshake className="w-7 h-7" />
          </div>
          <h2 className="text-base font-bold text-slate-800">Sin comisiones pendientes</h2>
          <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
            Por ahora no hay vendedores con comisiones por cobrar. Las comisiones se generan
            automáticamente cuando un especialista atribuido completa el onboarding o activa un plan
            pago.
          </p>
        </div>
      )}

      {/* Content */}
      {!loading && !loadError && sellers.length > 0 && (
        <>
          {/* Global stats */}
          {/* Dos columnas: quedaron dos tarjetas al sacar la del equivalente en Bs. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Total en USD */}
            <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Total pendiente (USD)
              </p>
              <p className="text-2xl font-bold text-teal-600 mt-1">
                {formatUsd(totalGlobalPending)}
              </p>
            </div>

            {/*
              Acá había un "Equivalente en Bs" del total pendiente a la tasa de hoy.
              Se sacó: lo pendiente se debe en USD y la tasa se mueve, así que ese
              número iba a diferir del que realmente se transfiera. Los bolívares
              aparecen en el formulario de pago y en el botón de confirmar, calculados
              sobre las comisiones efectivamente seleccionadas.
            */}

            {/* Vendedores con saldo */}
            <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Vendedores con saldo
              </p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{sellers.length}</p>
            </div>
          </div>

          {/* Seller list */}
          <div className="space-y-3">
            {sellers.map((seller) => {
              const isExpanded = expandedId === seller.sellerId;
              const marcadas = seller.commissions.filter((c) => selectedIds.has(c.commissionId));
              const aprobadasMarcadas = marcadas.filter((c) => c.status === 'approved');
              // "Total a pagar" cuenta SOLO las aprobadas: marcar una pendiente no
              // suma plata pagable, y mostrarla en ese total prometía un pago que
              // el backend iba a rechazar.
              const selectedTotal = calcSelectedTotal(
                seller.commissions.filter((c) => c.status === 'approved'),
                selectedIds,
              );
              const selectedCount = marcadas.length;
              const selectedApprovedCount = aprobadasMarcadas.length;
              const selectedPendingCount = marcadas.length - aprobadasMarcadas.length;
              const allSelected = seller.commissions.every((c) => selectedIds.has(c.commissionId));

              return (
                <article
                  key={seller.sellerId}
                  className={clsx(
                    'bg-white border rounded-xl overflow-hidden transition-shadow',
                    isExpanded
                      ? 'border-teal-200 shadow-sm shadow-teal-50'
                      : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  {/* Seller card header */}
                  <button
                    type="button"
                    onClick={() => handleExpand(seller.sellerId)}
                    aria-expanded={isExpanded}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left"
                  >
                    <div
                      className={clsx(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                        isExpanded ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-400',
                      )}
                    >
                      <Handshake className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm leading-tight">
                        {seller.sellerName}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {seller.pendingCount}{' '}
                        {seller.pendingCount === 1 ? 'comisión pendiente' : 'comisiones pendientes'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-teal-600">
                        {formatUsd(seller.totalPendingUsd)}
                      </p>
                      {/*
                        Lo pendiente va solo en USD: es la moneda en la que se debe.
                        Los bolívares aparecen recién al registrar el pago, con la
                        tasa de ese momento — que es la que se va a transferir.
                      */}
                      <p className="text-xs text-slate-400 mt-0.5">por cobrar</p>
                    </div>

                    <ChevronDown
                      className={clsx(
                        'w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200',
                        isExpanded && 'rotate-180',
                      )}
                    />
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #e2e8f0' }}>
                      {/* Tabs */}
                      <div className="flex border-b border-slate-100 px-5">
                        {(
                          [
                            {
                              key: 'commissions' as const,
                              label: 'Comisiones pendientes',
                              icon: ClipboardList,
                            },
                            { key: 'history' as const, label: 'Historial de pagos', icon: History },
                          ] as const
                        ).map(({ key, label, icon: Icon }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => void handleTabChange(key, seller.sellerId)}
                            className={clsx(
                              'flex items-center gap-1.5 px-1 py-3 mr-5 text-sm font-semibold transition-colors border-b-2 -mb-px',
                              activeTab === key
                                ? 'text-teal-600 border-teal-500'
                                : 'text-slate-400 border-transparent hover:text-slate-600',
                            )}
                          >
                            <Icon className="w-4 h-4" />
                            {label}
                          </button>
                        ))}
                      </div>

                      {/* Commissions tab */}
                      {activeTab === 'commissions' && (
                        <div className="p-5 space-y-4">
                          {/* Select all toggle */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSelectAll(seller)}
                              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
                            >
                              {allSelected ? (
                                <CheckSquare className="w-4 h-4 text-teal-500" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300" />
                              )}
                              <span className="font-medium">
                                {allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                              </span>
                            </button>
                            <span className="text-xs text-slate-400">
                              ({selectedCount} de {seller.commissions.length} seleccionadas)
                            </span>
                          </div>

                          {/* Commission rows */}
                          <div className="space-y-2">
                            {seller.commissions.map((commission) => {
                              const isChecked = selectedIds.has(commission.commissionId);
                              return (
                                <label
                                  key={commission.commissionId}
                                  className={clsx(
                                    'flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors',
                                    isChecked
                                      ? 'bg-teal-50/60 border border-teal-200'
                                      : 'bg-slate-50 border border-slate-100 hover:border-slate-200',
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggle(commission.commissionId)}
                                    className="sr-only"
                                  />
                                  {isChecked ? (
                                    <CheckSquare className="w-4 h-4 text-teal-500 shrink-0" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-300 shrink-0" />
                                  )}

                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 leading-tight">
                                      {commission.specialistName}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                      {formatDate(commission.earnedAt)}
                                    </p>
                                  </div>

                                  {/* Estado: distingue lo que falta revisar de lo
                                      que ya se puede pagar. */}
                                  <span
                                    className={clsx(
                                      'inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0',
                                      commission.status === 'approved'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-amber-50 text-amber-700 border border-amber-200',
                                    )}
                                  >
                                    {commission.status === 'approved' ? 'Aprobada' : 'Pendiente'}
                                  </span>

                                  <span
                                    className={clsx(
                                      'inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full shrink-0',
                                      getCommissionBadgeClass(commission.type, commission.planKey),
                                    )}
                                  >
                                    {getCommissionLabel(commission.type, commission.planKey)}
                                  </span>

                                  <p className="text-sm font-bold text-slate-700 shrink-0 min-w-[54px] text-right">
                                    {formatUsd(commission.amountUsd)}
                                  </p>
                                </label>
                              );
                            })}
                          </div>

                          {/* Total + action */}
                          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                            <div>
                              <p className="text-xs text-slate-400 font-medium">Total a pagar</p>
                              <p
                                className={clsx(
                                  'text-xl font-bold mt-0.5 transition-colors',
                                  selectedCount === 0 ? 'text-slate-300' : 'text-teal-600',
                                )}
                              >
                                {formatUsd(selectedTotal)}
                              </p>
                            </div>
                            {payStep === 'none' && (
                              <div className="flex flex-wrap items-center gap-2">
                                {/* Aprobar: habilita para pago. Solo aparece si hay
                                    alguna pendiente marcada. */}
                                {selectedPendingCount > 0 && (
                                  <button
                                    type="button"
                                    disabled={approving}
                                    onClick={() => void handleApprove(seller)}
                                    className="inline-flex items-center gap-2 bg-white hover:bg-emerald-50 border-2 border-emerald-500 text-emerald-700 disabled:opacity-50 text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
                                  >
                                    {approving
                                      ? 'Aprobando…'
                                      : `Aprobar ${selectedPendingCount} ${
                                          selectedPendingCount === 1 ? 'comisión' : 'comisiones'
                                        }`}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={selectedApprovedCount === 0}
                                  onClick={handleStartPay}
                                  title={
                                    selectedApprovedCount === 0
                                      ? 'Solo se pueden pagar comisiones aprobadas.'
                                      : undefined
                                  }
                                  className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-lg px-5 py-2.5 transition-colors"
                                >
                                  Registrar pago
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Inline payment form */}
                          {(payStep === 'form' || payStep === 'submitting') && (
                            <PaymentForm
                              seller={seller}
                              selectedIds={selectedIds}
                              selectedTotal={selectedTotal}
                              selectedCount={selectedCount}
                              bcvRate={bcvRate}
                              form={payForm}
                              step={payStep}
                              error={payError}
                              receiptFile={receiptFile}
                              receiptPath={receiptPath}
                              receiptUploading={receiptUploading}
                              receiptUploadError={receiptUploadError}
                              onFormChange={(patch) =>
                                setPayForm((prev) => ({ ...prev, ...patch }))
                              }
                              onReceiptFile={(f) => void handleReceiptFile(f)}
                              onCancel={handleCancelPay}
                              onSubmit={() => void handleSubmitPay(seller)}
                            />
                          )}
                        </div>
                      )}

                      {/* History tab */}
                      {activeTab === 'history' && (
                        <HistoryTab
                          loading={historyLoading}
                          error={historyError}
                          payments={historyLoadedFor === seller.sellerId ? history : []}
                          fetchingReceiptId={fetchingReceiptId}
                          onRetry={() => {
                            setHistoryLoadedFor(null);
                            void handleTabChange('history', seller.sellerId);
                          }}
                          onOpenReceipt={(paymentId) => void openReceipt(paymentId)}
                        />
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PaymentForm sub-component
// ---------------------------------------------------------------------------

interface PaymentFormProps {
  seller: PendingBySeller;
  selectedIds: Set<string>;
  selectedTotal: number;
  selectedCount: number;
  /** Tasa BCV actual para mostrar equivalente en Bs. null → no mostrar Bs. */
  bcvRate: number | null;
  form: PayForm;
  step: 'form' | 'submitting';
  error: string | null;
  receiptFile: File | null;
  receiptPath: string | null;
  receiptUploading: boolean;
  receiptUploadError: string | null;
  onFormChange: (patch: Partial<PayForm>) => void;
  onReceiptFile: (file: File) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

/**
 * Datos de cobro del vendedor, para que el admin sepa A DÓNDE transferir y solo
 * pueda elegir un método que el vendedor tenga realmente cargado.
 *
 * Se piden acá y no al abrir la pantalla: son datos de un solo vendedor y solo
 * hacen falta cuando se va a registrar el pago.
 */
function useSellerPaymentDetails(sellerId: string): {
  details: PaymentDetails | null;
  loading: boolean;
  error: string | null;
} {
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  // Arranca en true y NO se resetea de forma síncrona dentro del efecto: la
  // regla react-hooks/set-state-in-effect lo prohíbe (dispara un render en
  // cascada). El reset vive dentro de la función async de abajo.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function cargar(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/sellers/${sellerId}/payment-details`, {
          cache: 'no-store',
        });
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { paymentDetails: PaymentDetails };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setError(json.error ?? 'No se pudieron cargar los datos de cobro.');
          return;
        }
        setDetails(json.data?.paymentDetails ?? null);
      } catch {
        if (!cancelled) setError('No se pudieron cargar los datos de cobro.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void cargar();

    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  return { details, loading, error };
}

function PaymentForm({
  seller,
  selectedIds,
  selectedTotal,
  selectedCount,
  bcvRate,
  form,
  step,
  error,
  receiptFile,
  receiptPath,
  receiptUploading,
  receiptUploadError,
  onFormChange,
  onReceiptFile,
  onCancel,
  onSubmit,
}: PaymentFormProps) {
  const isSubmitting = step === 'submitting';
  const selectedCommissions = seller.commissions.filter((c) => selectedIds.has(c.commissionId));
  const hasBcv = bcvRate !== null && bcvRate > 0;

  const {
    details: paymentDetails,
    loading: detailsLoading,
    error: detailsError,
  } = useSellerPaymentDetails(seller.sellerId);
  const metodosDelVendedor = activeMethodsOf(paymentDetails);

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-5">
      {/* Summary of what will be paid */}
      <div>
        <h3 className="text-sm font-bold text-slate-800 mb-3">
          Resumen del pago a {seller.sellerName}
        </h3>
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {selectedCommissions.map((c) => (
            <div key={c.commissionId} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className={clsx(
                  'inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full shrink-0',
                  getCommissionBadgeClass(c.type, c.planKey),
                )}
              >
                {getCommissionLabel(c.type, c.planKey)}
              </span>
              <span className="flex-1 text-sm text-slate-700 min-w-0 truncate">
                {c.specialistName}
              </span>
              <span className="text-sm font-semibold text-slate-700 shrink-0">
                {formatUsd(c.amountUsd)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3 bg-teal-50 rounded-b-lg">
            <span className="text-sm font-bold text-teal-800">
              Total ({selectedCount} {selectedCount === 1 ? 'comisión' : 'comisiones'})
            </span>
            <div className="text-right">
              <span className="text-lg font-bold text-teal-700">{formatUsd(selectedTotal)}</span>
              {hasBcv && selectedTotal > 0 && (
                <p className="text-sm font-semibold text-teal-600 mt-0.5">
                  {fmtBs(selectedTotal, bcvRate)}
                </p>
              )}
              {!hasBcv && (
                <p className="text-[11px] text-slate-400 mt-0.5">Tasa BCV no disponible</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Irreversibility warning */}
      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 leading-relaxed">
          <span className="font-bold">Esta operación no tiene reverso desde la plataforma.</span>{' '}
          Verificá el monto y los datos antes de confirmar. Al registrar el pago, el vendedor verá
          estas comisiones como pagadas en su portal.
        </p>
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        <div>
          <label htmlFor="pay-method" className="block text-xs font-semibold text-slate-600 mb-1.5">
            Método de pago <span className="text-red-400">*</span>
          </label>
          <select
            id="pay-method"
            value={form.method}
            onChange={(e) => onFormChange({ method: e.target.value })}
            disabled={isSubmitting || detailsLoading || metodosDelVendedor.length === 0}
            className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 transition-colors bg-white disabled:opacity-50"
          >
            <option value="">
              {detailsLoading ? 'Cargando métodos…' : 'Seleccioná un método…'}
            </option>
            {/* Solo los métodos que el vendedor tiene cargados. Antes era una lista
                fija con todos los del sistema y se podía elegir uno sin datos. */}
            {metodosDelVendedor.map((m) => (
              <option key={m} value={m}>
                {methodLabel(m)}
              </option>
            ))}
          </select>

          {!detailsLoading && metodosDelVendedor.length === 0 && (
            <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {detailsError ??
                'Este vendedor todavía no cargó sus datos de cobro. Pedile que los complete en su portal antes de registrarle el pago.'}
            </p>
          )}

          {/* Datos para hacer la transferencia. Sin esto el admin tenía que salir
              a buscarlos a otra pantalla para poder pagar. */}
          {form.method && paymentDetails && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                Datos para el pago
              </p>
              {entriesOf(paymentDetails, form.method).map((entry, i, arr) => (
                <div
                  key={i}
                  className={i < arr.length - 1 ? 'mb-2 pb-2 border-b border-slate-100' : ''}
                >
                  {arr.length > 1 && (
                    <p className="text-[11px] font-semibold text-slate-500 mb-0.5">
                      {entryLabel(entry, i)}
                    </p>
                  )}
                  {Object.entries(entry)
                    .filter(([, v]) => v && v.trim() !== '')
                    .map(([k, v]) => (
                      <p key={k} className="text-sm text-slate-700">
                        <span className="text-slate-400">{fieldLabel(k)}:</span>{' '}
                        <span className="font-medium select-all">{v}</span>
                      </p>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="pay-reference"
            className="block text-xs font-semibold text-slate-600 mb-1.5"
          >
            Referencia / número de confirmación <span className="text-red-400">*</span>
          </label>
          <input
            id="pay-reference"
            type="text"
            value={form.reference}
            onChange={(e) => onFormChange({ reference: e.target.value })}
            disabled={isSubmitting}
            maxLength={500}
            placeholder="Ej: 0000987654321"
            className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 transition-colors disabled:opacity-50"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Receipt file upload */}
          <div>
            <p className="block text-xs font-semibold text-slate-600 mb-1.5">
              Comprobante{' '}
              <span className="text-slate-400 font-normal">
                (opcional · JPEG, PNG, WebP o PDF, máx. 10 MB)
              </span>
            </p>
            {!receiptFile && !receiptUploadError ? (
              <label
                htmlFor="pay-receipt"
                className={`flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-lg transition-colors ${
                  isSubmitting
                    ? 'border-slate-100 cursor-not-allowed opacity-50'
                    : 'border-slate-200 cursor-pointer hover:border-teal-400'
                }`}
              >
                <Upload className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-sm text-slate-500">Seleccioná un archivo…</span>
                <input
                  id="pay-receipt"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="sr-only"
                  disabled={isSubmitting}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onReceiptFile(f);
                    // Reset so onChange fires again if the same file is reselected.
                    e.target.value = '';
                  }}
                />
              </label>
            ) : receiptUploading ? (
              <div className="flex items-center gap-2 px-4 py-3 border border-slate-200 rounded-lg text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-teal-500 shrink-0" />
                Subiendo comprobante…
              </div>
            ) : receiptUploadError ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600 flex-1">{receiptUploadError}</p>
                </div>
                <label
                  htmlFor="pay-receipt-retry"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-600 hover:text-teal-700 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Reintentar
                  <input
                    id="pay-receipt-retry"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="sr-only"
                    disabled={isSubmitting}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onReceiptFile(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            ) : (
              /* File uploaded successfully — show name + path confirmation */
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 px-4 py-3 bg-teal-50 border border-teal-200 rounded-lg">
                  <FileCheck className="w-4 h-4 text-teal-500 shrink-0" />
                  <span className="text-sm text-teal-800 font-medium truncate flex-1">
                    {receiptFile?.name}
                  </span>
                </div>
                <label
                  htmlFor="pay-receipt-change"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Cambiar archivo
                  <input
                    id="pay-receipt-change"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="sr-only"
                    disabled={isSubmitting}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onReceiptFile(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="pay-notes"
              className="block text-xs font-semibold text-slate-600 mb-1.5"
            >
              Notas <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              id="pay-notes"
              type="text"
              value={form.notes}
              onChange={(e) => onFormChange({ notes: e.target.value })}
              disabled={isSubmitting}
              maxLength={1000}
              placeholder="Observaciones del pago"
              className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 transition-colors disabled:opacity-50"
            />
          </div>
        </div>

        {/* Confirmation that the file is attached before submitting */}
        {receiptPath && (
          <p className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
            Comprobante adjunto. Se guardará junto con el pago.
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting || receiptUploading || !form.method || !form.reference.trim()}
          className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-lg px-5 py-2 transition-colors"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Confirmar pago de {formatUsd(selectedTotal)}
          {hasBcv && selectedTotal > 0 && ` (${fmtBs(selectedTotal, bcvRate)})`}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HistoryTab sub-component
// ---------------------------------------------------------------------------

interface HistoryTabProps {
  loading: boolean;
  error: string | null;
  payments: SellerPaymentRow[];
  fetchingReceiptId: string | null;
  onRetry: () => void;
  onOpenReceipt: (paymentId: string) => void;
}

function HistoryTab({
  loading,
  error,
  payments,
  fetchingReceiptId,
  onRetry,
  onOpenReceipt,
}: HistoryTabProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-slate-400 py-10">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando historial…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-sm font-semibold text-teal-600 hover:text-teal-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 px-6">
        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-300 flex items-center justify-center">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <p className="text-sm text-slate-500 text-center">
          Todavía no se han registrado pagos para este vendedor.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {payments.map((payment) => {
        const payHasBcv = payment.bcvRate !== null && payment.bcvRate > 0;
        return (
          <div key={payment.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                {/*
                  El admin transfirió bolívares: Bs manda. El USD queda como
                  equivalente y la tasa como respaldo del cálculo.
                  Cuando bcvRate es null, no había tasa al registrar → solo USD.
                */}
                {payHasBcv ? (
                  <>
                    <p className="text-base font-bold text-slate-900 tabular-nums">
                      {fmtBs(payment.amountUsd, payment.bcvRate!)}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {/* methodLabel tolera las dos formas: los pagos viejos guardaron
                          el rótulo ("Zelle") y los nuevos guardan la clave ("zelle"). */}
                      equivalente {formatUsd(payment.amountUsd)} · {methodLabel(payment.method)}
                      {payment.reference && (
                        <>
                          {' '}
                          · Ref: <span className="font-mono">{payment.reference}</span>
                        </>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Tasa BCV al registrar: {payment.bcvRate!.toFixed(2)} Bs/USD ·{' '}
                      {formatDate(payment.paidAt)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-base font-bold text-slate-900 tabular-nums">
                      {formatUsd(payment.amountUsd)}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {methodLabel(payment.method)}
                      {payment.reference && (
                        <>
                          {' '}
                          · Ref: <span className="font-mono">{payment.reference}</span>
                        </>
                      )}{' '}
                      · {formatDate(payment.paidAt)}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      No se registró la tasa BCV para este pago.
                    </p>
                  </>
                )}
                {payment.notes && (
                  <p className="text-xs text-slate-400 mt-1 italic">{payment.notes}</p>
                )}
              </div>
              {payment.receiptUrl && (
                /* receiptUrl is a GCS storage path — NOT a URL. We fetch a
                   short-lived signed URL on demand via the BFF. */
                <button
                  type="button"
                  onClick={() => onOpenReceipt(payment.id)}
                  disabled={fetchingReceiptId === payment.id}
                  className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-semibold mt-0.5 disabled:opacity-50 transition-opacity shrink-0"
                >
                  {fetchingReceiptId === payment.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ExternalLink className="w-3 h-3" />
                  )}
                  Ver comprobante
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
