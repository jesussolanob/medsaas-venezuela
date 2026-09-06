'use client';

/**
 * ApprovePaymentModal.tsx
 *
 * Modal para aprobar el pago de una consulta.
 * Permite confirmar el monto base (read-only) y agregar servicios adicionales
 * (descripción + monto). El total = base + Σ(extras) se envía al backend.
 *
 * Endpoint BFF: PATCH /api/doctor/consultations/:id/approve-payment
 * Body: { extras: Array<{ description: string; amount_usd: number }>, method?: string }
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  DollarSign,
  Loader2,
  CheckCircle,
  Package,
  AlertTriangle,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import { useBcvRate } from '@/lib/useBcvRate';

export type ExtraItem = {
  description: string;
  amount_usd: number;
};

export type ExistingExtraItem = {
  id: string;
  description: string;
  amount_usd: number;
  /** Present when the extra is linked to an inventory product (optional — backend may not expose yet). */
  product_id?: string | null;
  quantity?: number | null;
  unit_price_usd?: number | null;
};

type ExtraRow = {
  /** Client-side key for list rendering */
  key: string;
  description: string;
  amount: string; // string so the input is controlled without clamping
};

// ---------------------------------------------------------------------------
// Inventory product extras
// ---------------------------------------------------------------------------

type InventoryProduct = {
  id: string;
  name: string;
  sale_price_amount: number;
  sale_price_currency: 'USD' | 'VES';
  stock_qty: number;
  low_stock_threshold: number | null;
};

type ProductExtraRow = {
  key: string;
  product_id: string;
  product_name: string;
  sale_price_amount: number;
  sale_price_currency: 'USD' | 'VES';
  /** Current stock before this sale. Used only for the warning UI. */
  stock_qty: number;
  low_stock_threshold: number | null;
  qty: string;
};

type Props = {
  open: boolean;
  consultationId: string;
  /** Monto base fijo de la consulta. Se muestra read-only. */
  baseAmount: number;
  /** Extras ya guardados — se precarga la lista con estos valores al abrir. */
  existingExtras: ExistingExtraItem[];
  /** Método de pago activo en el panel (se envía al backend si está disponible). */
  paymentMethod?: string;
  onClose: () => void;
  /** Llamado con el total y los nuevos extra_items tras aprobar exitosamente. */
  onApproved: (total: number, extras: ExistingExtraItem[]) => void;
};

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `row-${keyCounter}`;
}

/**
 * Rebuilds the product rows of a consultation that already has approved product
 * lines, so that re-approving re-sends them.
 *
 * `catalog` may be empty when the inventory failed to load: the existing extras
 * already carry product_id, quantity and unit_price_usd, which is enough to
 * re-send the sale. Losing these rows would make the backend revert the stock
 * without applying it again — the drift is silent, so the fallback matters.
 */
function rehydrateProductRows(
  productExtras: ExistingExtraItem[],
  catalog: InventoryProduct[],
): ProductExtraRow[] {
  return productExtras.map((e) => {
    const product = catalog.find((p) => p.id === e.product_id);
    return {
      key: nextKey(),
      product_id: e.product_id as string,
      product_name: product?.name ?? e.description,
      // unit_price_usd is already in USD, so the snapshot fallback is USD too.
      sale_price_amount: product ? product.sale_price_amount : Number(e.unit_price_usd ?? 0),
      sale_price_currency: product?.sale_price_currency ?? 'USD',
      stock_qty: product ? product.stock_qty : 0,
      low_stock_threshold: product?.low_stock_threshold ?? null,
      qty: String(e.quantity ?? 1),
    };
  });
}

function buildRows(items: ExistingExtraItem[]): ExtraRow[] {
  return items.map((item) => ({
    key: nextKey(),
    description: item.description,
    amount: String(item.amount_usd),
  }));
}

export default function ApprovePaymentModal({
  open,
  consultationId,
  baseAmount,
  existingExtras,
  paymentMethod,
  onClose,
  onApproved,
}: Props) {
  const [rows, setRows] = useState<ExtraRow[]>([]);
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { format, rate: bcvRate } = useBcvRate();

  // Inventory product extras
  const [productRows, setProductRows] = useState<ProductExtraRow[]>([]);
  const [inventoryProducts, setInventoryProducts] = useState<InventoryProduct[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [inventoryLoadError, setInventoryLoadError] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');

  // Reset rows and load inventory products each time the modal opens.
  useEffect(() => {
    if (open) {
      // Split existing extras: text-free extras → ExtraRow, product extras → rebuilt after inventory loads.
      const textExtras = existingExtras.filter((e) => !e.product_id);
      const productExtras = existingExtras.filter((e) => e.product_id);

      setRows(buildRows(textExtras));
      setProductRows([]);
      setSelectedProductId('');
      setInventoryLoadError(false);

      // Fetch active inventory products for the product-extras selector.
      setLoadingInventory(true);
      fetch('/api/doctor/inventory/products?active=true&limit=200')
        .then(async (res) => {
          // A failed response RESOLVES the promise, so these early returns must
          // rehydrate too — otherwise a 500 silently drops the product lines and
          // the re-approval reverts the stock without applying it again.
          if (!res.ok) {
            setInventoryLoadError(true);
            if (productExtras.length > 0) setProductRows(rehydrateProductRows(productExtras, []));
            return;
          }
          const json = (await res.json()) as {
            success?: boolean;
            data?: { products?: unknown[] } | unknown[];
          };
          if (!json.success) {
            setInventoryLoadError(true);
            if (productExtras.length > 0) setProductRows(rehydrateProductRows(productExtras, []));
            return;
          }
          const raw = json.data;
          const rawList: unknown[] = Array.isArray(raw)
            ? raw
            : Array.isArray((raw as { products?: unknown[] }).products)
              ? (raw as { products: unknown[] }).products
              : [];

          // ⚠️ El wire de /api/doctor/inventory/products es **camelCase**: el
          // controlador devuelve la entidad tal cual (salePriceAmount, stockQty).
          // Acá se leía en snake_case y, como el fallback era `?? 0`, TODOS los
          // productos aparecían con "stock: 0" y precio 0 — un dato que parece
          // legítimo ("no hay stock") en vez de un error visible. Peor que el NaN
          // que dio el mismo desajuste en el catálogo, porque no se nota.
          // Se aceptan las dos formas por si algún consumidor viejo manda snake_case.
          const num = (camel: unknown, snake: unknown): number => Number(camel ?? snake ?? 0);

          const products: InventoryProduct[] = rawList.map((item) => {
            const p = item as Record<string, unknown>;
            const umbral = p.lowStockThreshold ?? p.low_stock_threshold;
            return {
              id: String(p.id ?? ''),
              name: String(p.name ?? ''),
              sale_price_amount: num(p.salePriceAmount, p.sale_price_amount),
              sale_price_currency: (p.salePriceCurrency ?? p.sale_price_currency ?? 'USD') as
                | 'USD'
                | 'VES',
              stock_qty: num(p.stockQty, p.stock_qty),
              low_stock_threshold: umbral !== null && umbral !== undefined ? Number(umbral) : null,
            };
          });

          setInventoryProducts(products);

          // Issue #4: rehydrate product rows from existing extras that had a product_id.
          if (productExtras.length > 0) {
            setProductRows(rehydrateProductRows(productExtras, products));
          }
        })
        .catch(() => {
          setInventoryLoadError(true);
          // Rehydrate from the snapshot even when the catalog failed to load.
          // The existing extras already carry product_id, quantity and unit_price_usd,
          // which is everything needed to re-send the sale. Skipping this would make
          // a re-approval revert the stock without applying it again — silent drift.
          if (productExtras.length > 0) {
            setProductRows(rehydrateProductRows(productExtras, []));
          }
        })
        .finally(() => setLoadingInventory(false));
    }
  }, [open, existingExtras]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { key: nextKey(), description: '', amount: '' }]);
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }, []);

  const updateDescription = useCallback((key: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, description: value } : r)));
  }, []);

  const updateAmount = useCallback((key: string, value: string) => {
    // Allow only digits and a single decimal point
    const sanitized = value.replace(/[^0-9.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1');
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, amount: sanitized } : r)));
  }, []);

  // Inventory product row helpers
  const addProductRow = useCallback(() => {
    if (!selectedProductId) return;
    const product = inventoryProducts.find((p) => p.id === selectedProductId);
    if (!product) return;
    // Don't add the same product twice — update qty instead.
    const existing = productRows.find((r) => r.product_id === selectedProductId);
    if (existing) {
      showToast({
        type: 'error',
        message: `"${product.name}" ya está en la lista. Ajusta la cantidad.`,
      });
      return;
    }
    setProductRows((prev) => [
      ...prev,
      {
        key: nextKey(),
        product_id: product.id,
        product_name: product.name,
        sale_price_amount: product.sale_price_amount,
        sale_price_currency: product.sale_price_currency,
        stock_qty: product.stock_qty,
        low_stock_threshold: product.low_stock_threshold,
        qty: '1',
      },
    ]);
    setSelectedProductId('');
  }, [selectedProductId, inventoryProducts, productRows]);

  const removeProductRow = useCallback((key: string) => {
    setProductRows((prev) => prev.filter((r) => r.key !== key));
  }, []);

  const updateProductQty = useCallback((key: string, value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1');
    setProductRows((prev) => prev.map((r) => (r.key === key ? { ...r, qty: sanitized } : r)));
  }, []);

  /** Filas con descripción NO vacía y monto > 0 — las únicas que se envían. */
  function validExtras(): ExtraItem[] {
    return rows
      .filter((r) => r.description.trim().length > 0 && parseFloat(r.amount) > 0)
      .map((r) => ({ description: r.description.trim(), amount_usd: parseFloat(r.amount) }));
  }

  /** Filas que tienen monto pero no descripción — bloquean el envío. */
  function hasIncompleteRows(): boolean {
    return rows.some((r) => r.amount && parseFloat(r.amount) > 0 && !r.description.trim());
  }

  /**
   * Estimated USD value of one product row.
   * USD rows are exact; VES rows are divided by the BCV rate (approximate).
   */
  function productLineUsd(row: ProductExtraRow): { amount: number; isApprox: boolean } {
    const qty = parseFloat(row.qty) || 0;
    if (row.sale_price_currency === 'USD') {
      return { amount: qty * row.sale_price_amount, isApprox: false };
    }
    const r = bcvRate ?? 0;
    return { amount: r > 0 ? (qty * row.sale_price_amount) / r : 0, isApprox: true };
  }

  const textExtrasTotal = validExtras().reduce((acc, e) => acc + e.amount_usd, 0);
  const validProductLines = productRows
    .filter((r) => r.product_id && parseFloat(r.qty) > 0)
    .map((r) => ({ row: r, ...productLineUsd(r) }));
  const productExtrasTotal = validProductLines.reduce((acc, l) => acc + l.amount, 0);
  const hasVesProducts = validProductLines.some((l) => l.isApprox);
  const extrasTotal = textExtrasTotal; // kept for breakdown display
  const grandTotal = baseAmount + textExtrasTotal + productExtrasTotal;

  /**
   * Confirmar el cobro PERSISTE de una vez (decisión del dueño, 2026-08-17).
   *
   * Antes este modal solo confirmaba el monto en memoria y el guardado real
   * ocurría al presionar "Guardar pago" en el panel. La pantalla pasaba a
   * "Pago: Aprobado" sin que nada se hubiera escrito: si el especialista no
   * pulsaba el segundo botón, el cobro no existía. Peor todavía, al marcar
   * "No asistió" con multa sobre esa consulta el backend la veía impaga y la
   * multa REEMPLAZABA el monto en vez de sumarse (un cobro de 50 quedaba en 10).
   *
   * El endpoint ya existía completo —solo nadie lo llamaba—: persiste
   * `consultations.amount = base + Σ(extras)` y `payment_status = 'approved'`.
   * El método de pago es una invariante del backend; si falta, responde con el
   * error y el modal queda abierto en vez de mentir con un "Aprobado".
   */
  async function handleConfirm() {
    if (hasIncompleteRows()) {
      showToast({
        type: 'error',
        message: 'Completa la descripción de todos los servicios adicionales con monto.',
      });
      return;
    }

    setSaving(true);
    try {
      // Build product_extras — backend resolves price and validates stock.
      // Amount is intentionally NOT sent per spec §6: backend calculates it.
      const validProductExtras = productRows
        .filter((r) => r.product_id && parseFloat(r.qty) > 0)
        .map((r) => ({ product_id: r.product_id, quantity: parseFloat(r.qty) }));

      const res = await fetch(`/api/doctor/consultations/${consultationId}/approve-payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extras: validExtras(),
          product_extras: validProductExtras,
          ...(paymentMethod?.trim() ? { method: paymentMethod.trim() } : {}),
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: { amount?: number | null; extra_items?: ExistingExtraItem[] };
      };

      if (!res.ok || !json.success) {
        showToast({
          type: 'error',
          message: json.error ?? 'No se pudo aprobar el cobro. Intenta de nuevo.',
        });
        return;
      }

      // El total y los extras vuelven del servidor con sus ids reales.
      onApproved(
        typeof json.data?.amount === 'number' ? json.data.amount : grandTotal,
        json.data?.extra_items ?? [],
      );
      showToast({ type: 'success', message: 'Cobro aprobado' });
      onClose();
    } catch {
      showToast({ type: 'error', message: 'Error de conexión al aprobar el cobro.' });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approve-payment-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl g-bg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2
                id="approve-payment-title"
                className="text-sm font-bold text-slate-800 leading-tight"
              >
                Aprobar pago
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Confirma el cobro de esta consulta
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Monto base (read-only) */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Consulta (base)
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Monto base</span>
              <span className="text-sm font-bold text-slate-800">{format(baseAmount)}</span>
            </div>
          </div>

          {/* Servicios adicionales */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Servicios adicionales
              </p>
              <button
                type="button"
                onClick={addRow}
                disabled={saving}
                className="flex items-center gap-1 text-[11px] font-semibold text-teal-600 hover:text-teal-700 transition-colors disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar servicio
              </button>
            </div>

            {rows.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                Sin servicios adicionales. El total es solo el monto base.
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => {
                  const amountVal = parseFloat(row.amount);
                  const hasAmountNoDesc = row.amount && amountVal > 0 && !row.description.trim();
                  return (
                    <div key={row.key} className="flex items-start gap-2">
                      {/* Descripción */}
                      <div className="flex-1">
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => updateDescription(row.key, e.target.value)}
                          placeholder="Descripción del servicio"
                          disabled={saving}
                          className={`w-full text-xs border rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all bg-white placeholder:text-slate-300 disabled:opacity-60 ${
                            hasAmountNoDesc
                              ? 'border-red-300 text-red-700'
                              : 'border-slate-200 text-slate-700'
                          }`}
                        />
                        {hasAmountNoDesc && (
                          <p className="text-[10px] text-red-500 mt-0.5">Descripción requerida</p>
                        )}
                      </div>
                      {/* Monto */}
                      <div className="w-24 shrink-0">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-semibold pointer-events-none">
                            $
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.amount}
                            onChange={(e) => updateAmount(row.key, e.target.value)}
                            placeholder="0.00"
                            disabled={saving}
                            className="w-full text-xs border border-slate-200 rounded-lg py-2 pl-5 pr-2 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all bg-white text-slate-700 placeholder:text-slate-300 disabled:opacity-60"
                          />
                        </div>
                      </div>
                      {/* Quitar fila */}
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        disabled={saving}
                        className="mt-0.5 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        aria-label="Quitar servicio"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Productos del inventario */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3 h-3" />
                Productos de inventario
              </p>
            </div>

            {loadingInventory ? (
              <p className="text-xs text-slate-400 italic py-1">Cargando productos…</p>
            ) : inventoryLoadError ? (
              <p className="text-xs text-red-500 italic py-1">No se pudo cargar el inventario</p>
            ) : inventoryProducts.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1">Sin productos en inventario</p>
            ) : (
              <div className="space-y-2">
                {/* Selector */}
                <div className="flex gap-2">
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    disabled={saving}
                    className="flex-1 text-xs border border-slate-200 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all bg-white text-slate-700 disabled:opacity-60"
                  >
                    <option value="">Seleccionar producto…</option>
                    {inventoryProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (stock: {Number(p.stock_qty).toLocaleString('es-VE')})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addProductRow}
                    disabled={saving || !selectedProductId}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Agregar
                  </button>
                </div>

                {/* Selected product rows */}
                {productRows.length > 0 && (
                  <div className="space-y-2">
                    {productRows.map((row) => {
                      const qty = parseFloat(row.qty) || 0;
                      const resultingStock = row.stock_qty - qty;
                      const wouldGoNegative = resultingStock < 0;
                      const { amount: lineUsd, isApprox } = productLineUsd(row);
                      const lineLabel =
                        row.sale_price_currency === 'USD'
                          ? `$${(qty * row.sale_price_amount).toFixed(2)}`
                          : `Bs. ${(qty * row.sale_price_amount).toLocaleString('es-VE')}${isApprox && lineUsd > 0 ? ` (≈ $${lineUsd.toFixed(2)})` : ''}`;
                      return (
                        <div key={row.key} className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-xs font-semibold text-slate-700 truncate">
                                {row.product_name}
                              </p>
                              <span className="text-[11px] font-semibold text-slate-600 shrink-0">
                                {lineLabel}
                              </span>
                            </div>
                            {wouldGoNegative && (
                              <div className="flex items-center gap-1 mt-0.5 text-[10px] text-amber-600">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                El stock quedaría en {resultingStock.toLocaleString('es-VE')}{' '}
                                (negativo)
                              </div>
                            )}
                          </div>
                          <div className="w-20 shrink-0">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.qty}
                              onChange={(e) => updateProductQty(row.key, e.target.value)}
                              placeholder="1"
                              disabled={saving}
                              className="w-full text-xs border border-slate-200 rounded-lg py-2 px-2.5 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all bg-white text-slate-700 placeholder:text-slate-300 disabled:opacity-60"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeProductRow(row.key)}
                            disabled={saving}
                            className="mt-0.5 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                            aria-label="Quitar producto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Total */}
          <div className="rounded-xl border-2 border-teal-200 bg-teal-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-700">Total a cobrar</span>
              <span className="text-lg font-extrabold text-teal-700">
                {hasVesProducts && '≈ '}
                {format(grandTotal)}
              </span>
            </div>
            {(extrasTotal > 0 || productExtrasTotal > 0) && (
              <p className="text-[10px] text-teal-500 mt-1">
                Base {format(baseAmount)}
                {extrasTotal > 0 && ` + servicios ${format(extrasTotal)}`}
                {productExtrasTotal > 0 &&
                  ` + productos ${hasVesProducts ? '≈ ' : ''}${format(productExtrasTotal)}`}
              </p>
            )}
            {hasVesProducts && (
              <p className="text-[10px] text-amber-600 mt-1">
                Los productos en Bs. se muestran como estimación. El monto definitivo lo calcula el
                servidor al confirmar.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || hasIncompleteRows()}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-500 rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Aprobando…
              </>
            ) : (
              <>
                <CheckCircle className="w-3.5 h-3.5" />
                Confirmar cobro
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
