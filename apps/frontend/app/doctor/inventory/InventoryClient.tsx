'use client';

/**
 * InventoryClient
 *
 * Main client component for /doctor/inventory.
 * Renders the product list, search, create/edit modal, deactivation,
 * stock-movement modal, and low-stock alerts.
 */

import { useState, useEffect, useCallback, useTransition } from 'react';
import {
  Plus,
  Search,
  Package,
  AlertTriangle,
  Pencil,
  Trash2,
  History,
  X,
  Loader2,
  ChevronDown,
  ArrowDownToLine,
  ArrowUpFromLine,
  ImageIcon,
  Download,
  XCircle,
  PackagePlus,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useBcvRate, BsLabel } from '@/lib/useBcvRate';
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deactivateProduct,
  getMovements,
  registerMovement,
  reverseMovement,
  type ProductRow,
  type MovementRow,
  type PriceCurrency,
  type MovementKind,
} from './actions';
import ProductPhotoUploader from './ProductPhotoUploader';
import BulkStockModal from './BulkStockModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModalMode = 'create' | 'edit';

interface ProductFormState {
  name: string;
  description: string;
  supplier: string;
  sale_price_amount: string;
  sale_price_currency: PriceCurrency;
  stock_qty: string;
  low_stock_threshold: string;
  /** GCS path pending save (set after photo upload, before form submit). */
  pendingPhotoPath: string | null;
}

const EMPTY_FORM: ProductFormState = {
  name: '',
  description: '',
  supplier: '',
  sale_price_amount: '',
  sale_price_currency: 'USD',
  stock_qty: '0',
  low_stock_threshold: '',
  pendingPhotoPath: null,
};

function formFromProduct(p: ProductRow): ProductFormState {
  return {
    name: p.name,
    description: p.description,
    supplier: p.supplier ?? '',
    sale_price_amount: String(p.sale_price_amount),
    sale_price_currency: p.sale_price_currency,
    stock_qty: String(p.stock_qty),
    low_stock_threshold: p.low_stock_threshold !== null ? String(p.low_stock_threshold) : '',
    pendingPhotoPath: null,
  };
}

// ---------------------------------------------------------------------------
// Movement form
// ---------------------------------------------------------------------------

interface MovementFormState {
  kind: 'purchase' | 'adjustment' | 'loss';
  qty: string;
  note: string;
}

const EMPTY_MOVEMENT: MovementFormState = {
  kind: 'purchase',
  qty: '',
  note: '',
};

const KIND_LABELS: Record<'purchase' | 'adjustment' | 'loss', string> = {
  purchase: 'Compra / entrada',
  adjustment: 'Ajuste de inventario',
  loss: 'Merma / pérdida',
};

const KIND_SIGN: Record<'purchase' | 'adjustment' | 'loss', string> = {
  purchase: '+',
  adjustment: '±',
  loss: '−',
};

// ---------------------------------------------------------------------------
// Price helpers
// ---------------------------------------------------------------------------

function formatPrice(amount: number, currency: PriceCurrency): string {
  if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  // VES — show the amount directly in bolívares; USD equivalent is handled by vesToUsdApprox.
  return `Bs. ${amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function vesToUsdApprox(vesAmount: number, rate: number | null): string | null {
  if (!rate || rate <= 0) return null;
  const usd = vesAmount / rate;
  return `≈ $${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Stock badge
// ---------------------------------------------------------------------------

function StockBadge({ qty, threshold }: { qty: number; threshold: number | null }) {
  const isLow = threshold !== null && qty <= threshold;
  const isNeg = qty < 0;

  if (isNeg) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
        <AlertTriangle className="w-3 h-3" />
        {qty.toLocaleString('es-VE')}
      </span>
    );
  }

  if (isLow) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <AlertTriangle className="w-3 h-3" />
        {qty.toLocaleString('es-VE')} (bajo)
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      {qty.toLocaleString('es-VE')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Movement kind badge
// ---------------------------------------------------------------------------

const KIND_COLORS: Record<MovementKind, string> = {
  purchase: 'bg-emerald-50 text-emerald-700',
  sale: 'bg-sky-50 text-sky-700',
  adjustment: 'bg-violet-50 text-violet-700',
  loss: 'bg-rose-50 text-rose-700',
};

const KIND_UI_LABELS: Record<MovementKind, string> = {
  purchase: 'Compra',
  sale: 'Venta',
  adjustment: 'Ajuste',
  loss: 'Merma',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  initialProducts: ProductRow[];
}

export default function InventoryClient({ initialProducts }: Props) {
  const [products, setProducts] = useState<ProductRow[]>(initialProducts);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Product modal
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Movements modal
  const [movementsProduct, setMovementsProduct] = useState<ProductRow | null>(null);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [movForm, setMovForm] = useState<MovementFormState>(EMPTY_MOVEMENT);
  const [savingMov, setSavingMov] = useState(false);

  // Deactivate confirm
  const [confirmDeactivate, setConfirmDeactivate] = useState<ProductRow | null>(null);

  // Reversal confirm
  const [confirmReverse, setConfirmReverse] = useState<MovementRow | null>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);

  // Bulk stock modal
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const { rate: bcvRate } = useBcvRate();

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadProducts = useCallback((s: string, inactive: boolean) => {
    startTransition(async () => {
      try {
        const result = await getProducts({
          search: s || undefined,
          active: inactive ? undefined : true,
          limit: 100,
        });
        if (result.error) {
          showToast({ type: 'error', message: 'Error al cargar los productos' });
          return;
        }
        setProducts(result.products);
      } catch {
        showToast({ type: 'error', message: 'Error al cargar los productos' });
      }
    });
  }, []);

  useEffect(() => {
    loadProducts(search, showInactive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, showInactive]);

  // ---------------------------------------------------------------------------
  // CSV export (client-side, no backend call needed)
  // ---------------------------------------------------------------------------

  function exportCsv(prods: ProductRow[]) {
    const BOM = '﻿'; // UTF-8 BOM — makes Excel open the file correctly
    const SEP = ';'; // Semicolon separator for Spanish Excel (comma decimal)

    function escapeText(v: string): string {
      return `"${v.replace(/"/g, '""')}"`;
    }

    function fmtNumber(n: number): string {
      // es-VE uses comma as decimal separator; useGrouping:false removes the
      // thousands-separator dot that would trip up CSV numeric recognition.
      return n.toLocaleString('es-VE', { useGrouping: false, maximumFractionDigits: 4 });
    }

    const headers = [
      'Nombre',
      'Descripción',
      'Proveedor',
      'Precio',
      'Moneda',
      'Stock',
      'Umbral stock bajo',
      'Activo',
    ];

    const rows = prods.map((p) =>
      [
        escapeText(p.name),
        escapeText(p.description ?? ''),
        escapeText(p.supplier ?? ''),
        fmtNumber(p.sale_price_amount),
        escapeText(p.sale_price_currency),
        fmtNumber(p.stock_qty),
        p.low_stock_threshold !== null ? fmtNumber(p.low_stock_threshold) : '',
        escapeText(p.is_active ? 'Sí' : 'No'),
      ].join(SEP),
    );

    const csv = [headers.map(escapeText).join(SEP), ...rows].join('\r\n');
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `inventario-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Reversal — confirm → call backend → reload movements + product
  // ---------------------------------------------------------------------------

  async function handleReverseMovement() {
    if (!confirmReverse || !movementsProduct) return;

    const targetId = confirmReverse.id;
    const productId = movementsProduct.id;
    setReversingId(targetId);

    try {
      const result = await reverseMovement(targetId);
      if (result.error) {
        showToast({ type: 'error', message: result.error });
        return;
      }

      // Reload movements to get accurate reversal flags (reversesMovementId).
      const movResult = await getMovements(productId, { limit: 50 });
      if (!movResult.error) {
        setMovements(movResult.movements);
      }

      // Reload the product to reflect updated stock_qty.
      const updatedProduct = await getProduct(productId);
      if (updatedProduct) {
        setMovementsProduct(updatedProduct);
        setProducts((prev) => prev.map((p) => (p.id === productId ? updatedProduct : p)));
      }

      showToast({
        type: 'success',
        message: 'Movimiento anulado. El contra-asiento quedó registrado en el historial.',
      });
    } finally {
      setReversingId(null);
      setConfirmReverse(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Product modal helpers
  // ---------------------------------------------------------------------------

  function openCreateModal() {
    setModalMode('create');
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEditModal(p: ProductRow) {
    setModalMode('edit');
    setEditingProduct(p);
    setForm(formFromProduct(p));
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingProduct(null);
    setForm(EMPTY_FORM);
  }

  function updateForm(patch: Partial<ProductFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast({ type: 'error', message: 'El nombre del producto es requerido.' });
      return;
    }
    const amount = parseFloat(form.sale_price_amount);
    if (isNaN(amount) || amount < 0) {
      showToast({ type: 'error', message: 'El precio debe ser un número mayor o igual a cero.' });
      return;
    }

    setSaving(true);
    try {
      if (modalMode === 'create') {
        const result = await createProduct({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          supplier: form.supplier.trim() || undefined,
          photo_path: form.pendingPhotoPath ?? undefined,
          sale_price_amount: amount,
          sale_price_currency: form.sale_price_currency,
          stock_qty: parseFloat(form.stock_qty) || 0,
          low_stock_threshold: form.low_stock_threshold
            ? parseFloat(form.low_stock_threshold)
            : undefined,
        });
        if (result.error) {
          showToast({ type: 'error', message: result.error });
          return;
        }
        if (result.product) {
          setProducts((prev) => [result.product!, ...prev]);
        }
        showToast({ type: 'success', message: 'Producto creado' });
      } else if (editingProduct) {
        const result = await updateProduct(editingProduct.id, {
          name: form.name.trim(),
          description: form.description.trim(),
          supplier: form.supplier.trim() || undefined,
          photo_path: form.pendingPhotoPath !== null ? form.pendingPhotoPath : undefined,
          sale_price_amount: amount,
          sale_price_currency: form.sale_price_currency,
          low_stock_threshold: form.low_stock_threshold
            ? parseFloat(form.low_stock_threshold)
            : null,
        });
        if (result.error) {
          showToast({ type: 'error', message: result.error });
          return;
        }
        if (result.product) {
          setProducts((prev) =>
            prev.map((p) => (p.id === result.product!.id ? result.product! : p)),
          );
        }
        showToast({ type: 'success', message: 'Producto actualizado' });
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Deactivate
  // ---------------------------------------------------------------------------

  async function handleDeactivate(p: ProductRow) {
    const result = await deactivateProduct(p.id);
    if (result.error) {
      showToast({ type: 'error', message: result.error });
      return;
    }
    setProducts((prev) => prev.filter((x) => x.id !== p.id));
    showToast({ type: 'success', message: `"${p.name}" desactivado` });
    setConfirmDeactivate(null);
  }

  // ---------------------------------------------------------------------------
  // Movements
  // ---------------------------------------------------------------------------

  async function openMovements(p: ProductRow) {
    setMovementsProduct(p);
    setMovements([]);
    setMovForm(EMPTY_MOVEMENT);
    setLoadingMovements(true);
    try {
      const result = await getMovements(p.id, { limit: 50 });
      if (result.error) {
        showToast({ type: 'error', message: 'Error al cargar los movimientos' });
        return;
      }
      setMovements(result.movements);
    } catch {
      showToast({ type: 'error', message: 'Error al cargar los movimientos' });
    } finally {
      setLoadingMovements(false);
    }
  }

  function closeMovements() {
    setMovementsProduct(null);
    setMovements([]);
    setMovForm(EMPTY_MOVEMENT);
  }

  async function handleRegisterMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!movementsProduct) return;
    const qty = parseFloat(movForm.qty);
    if (isNaN(qty) || qty === 0) {
      showToast({ type: 'error', message: 'La cantidad debe ser un número distinto de cero.' });
      return;
    }

    setSavingMov(true);
    try {
      const result = await registerMovement(movementsProduct.id, {
        kind: movForm.kind,
        qty,
        note: movForm.note.trim() || undefined,
      });
      if (result.error) {
        showToast({ type: 'error', message: result.error });
        return;
      }
      if (result.movement) {
        setMovements((prev) => [result.movement!, ...prev]);
        // Update stock_qty in the product list optimistically
        setProducts((prev) =>
          prev.map((p) =>
            p.id === movementsProduct.id
              ? { ...p, stock_qty: p.stock_qty + result.movement!.qty }
              : p,
          ),
        );
        setMovementsProduct((prev) =>
          prev ? { ...prev, stock_qty: prev.stock_qty + result.movement!.qty } : prev,
        );
      }
      setMovForm(EMPTY_MOVEMENT);
      showToast({ type: 'success', message: 'Movimiento registrado' });
    } finally {
      setSavingMov(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Filtered list
  // ---------------------------------------------------------------------------

  const lowStockCount = products.filter(
    (p) => p.is_active && p.low_stock_threshold !== null && p.stock_qty <= p.low_stock_threshold,
  ).length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventario</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestiona tus productos y existencias</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => exportCsv(products)}
            disabled={products.length === 0}
            title="Exportar catálogo a CSV"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
          <button
            type="button"
            onClick={() => setBulkModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <PackagePlus className="w-4 h-4" />
            Cargar stock
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)' }}
          >
            <Plus className="w-4 h-4" />
            Nuevo producto
          </button>
        </div>
      </div>

      {/* ── Low-stock alert banner ───────────────────────────────────────── */}
      {lowStockCount > 0 && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span>
            <strong>{lowStockCount}</strong>{' '}
            {lowStockCount === 1 ? 'producto con stock bajo' : 'productos con stock bajo'}
          </span>
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors"
          />
        </div>
        <label className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 bg-white cursor-pointer hover:bg-slate-50 select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="accent-teal-500"
          />
          Mostrar inactivos
        </label>
      </div>

      {/* ── Product table ────────────────────────────────────────────────── */}
      {isPending ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Package className="w-12 h-12 mb-4 opacity-30" />
          <p className="font-medium">No hay productos</p>
          <p className="text-sm mt-1">Crea tu primer producto con el botón de arriba</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wide">
                    Producto
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wide">
                    Precio
                  </th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wide">
                    Stock
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wide hidden sm:table-cell">
                    Proveedor
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-slate-50 transition-colors ${!p.is_active ? 'opacity-50' : ''}`}
                  >
                    {/* Name + photo */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                          {p.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.photo_url}
                              alt={p.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="w-4 h-4 text-slate-300" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{p.name}</p>
                          {p.description && (
                            <p className="text-xs text-slate-400 line-clamp-1">{p.description}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold text-slate-800">
                        {formatPrice(p.sale_price_amount, p.sale_price_currency)}
                      </p>
                      {p.sale_price_currency === 'VES' && (
                        <p className="text-[11px] text-slate-400">
                          {vesToUsdApprox(p.sale_price_amount, bcvRate)}
                        </p>
                      )}
                      {p.sale_price_currency === 'USD' && (
                        <BsLabel
                          usd={p.sale_price_amount}
                          rate={bcvRate}
                          className="block text-right"
                        />
                      )}
                    </td>

                    {/* Stock */}
                    <td className="px-4 py-3 text-center">
                      <StockBadge qty={p.stock_qty} threshold={p.low_stock_threshold} />
                    </td>

                    {/* Supplier */}
                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                      {p.supplier ?? '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openMovements(p)}
                          title="Ver movimientos"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          title="Editar"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {p.is_active && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeactivate(p)}
                            title="Desactivar"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ──────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)' }}
                >
                  <Package className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-sm font-bold text-slate-800">
                  {modalMode === 'create' ? 'Nuevo producto' : 'Editar producto'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {/* Photo */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  Foto del producto
                </label>
                <ProductPhotoUploader
                  currentUrl={form.pendingPhotoPath ? null : (editingProduct?.photo_url ?? null)}
                  onUploaded={(path) => updateForm({ pendingPhotoPath: path })}
                />
                {form.pendingPhotoPath && (
                  <p className="text-[10px] text-teal-600 mt-1">
                    Nueva foto lista — se guardará al confirmar
                  </p>
                )}
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="Ej. Crema hidratante SPF 50"
                  required
                  maxLength={255}
                  className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 transition-all bg-white placeholder:text-slate-300"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Descripción
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                  placeholder="Descripción opcional..."
                  rows={2}
                  className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 transition-all bg-white placeholder:text-slate-300 resize-none"
                />
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Proveedor</label>
                <input
                  type="text"
                  value={form.supplier}
                  onChange={(e) => updateForm({ supplier: e.target.value })}
                  placeholder="Nombre del proveedor (opcional)"
                  maxLength={255}
                  className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 transition-all bg-white placeholder:text-slate-300"
                />
              </div>

              {/* Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Precio <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold pointer-events-none">
                      {form.sale_price_currency === 'USD' ? '$' : 'Bs.'}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.sale_price_amount}
                      onChange={(e) => {
                        const v = e.target.value
                          .replace(/[^0-9.]/g, '')
                          .replace(/^(\d*\.?\d*).*$/, '$1');
                        updateForm({ sale_price_amount: v });
                      }}
                      placeholder="0.00"
                      required
                      className="w-full text-sm border border-slate-200 rounded-xl py-2.5 pl-8 pr-3 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 transition-all bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Moneda</label>
                  <div className="relative">
                    <select
                      value={form.sale_price_currency}
                      onChange={(e) =>
                        updateForm({ sale_price_currency: e.target.value as PriceCurrency })
                      }
                      className="w-full appearance-none text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 transition-all bg-white pr-8"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="VES">VES (Bs.)</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Stock initial (only on create) */}
              {modalMode === 'create' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Stock inicial
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.stock_qty}
                      onChange={(e) => {
                        const v = e.target.value
                          .replace(/[^0-9.\-]/g, '')
                          .replace(/^(-?\d*\.?\d*).*$/, '$1');
                        updateForm({ stock_qty: v });
                      }}
                      placeholder="0"
                      className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Alerta de stock bajo
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.low_stock_threshold}
                      onChange={(e) => {
                        const v = e.target.value
                          .replace(/[^0-9.]/g, '')
                          .replace(/^(\d*\.?\d*).*$/, '$1');
                        updateForm({ low_stock_threshold: v });
                      }}
                      placeholder="Ej. 5"
                      className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 transition-all bg-white placeholder:text-slate-300"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">Opcional</p>
                  </div>
                </div>
              )}

              {/* Low-stock threshold (edit only) */}
              {modalMode === 'edit' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Alerta de stock bajo
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.low_stock_threshold}
                    onChange={(e) => {
                      const v = e.target.value
                        .replace(/[^0-9.]/g, '')
                        .replace(/^(\d*\.?\d*).*$/, '$1');
                      updateForm({ low_stock_threshold: v });
                    }}
                    placeholder="Ej. 5"
                    className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 transition-all bg-white placeholder:text-slate-300"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Dejar vacío para desactivar la alerta
                  </p>
                </div>
              )}

              {/* Footer buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)' }}
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {modalMode === 'create' ? 'Crear producto' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Deactivate confirm ───────────────────────────────────────────── */}
      {confirmDeactivate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            role="dialog"
            aria-modal="true"
          >
            <h3 className="font-bold text-slate-800 mb-2">Desactivar producto</h3>
            <p className="text-sm text-slate-500 mb-5">
              ¿Desactivar <strong>{confirmDeactivate.name}</strong>? El producto no se eliminará —
              su historial de movimientos se conserva.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeactivate(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDeactivate(confirmDeactivate)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reversal confirm dialog ──────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmReverse !== null}
        title="Anular movimiento"
        message="Se creará un contra-asiento que cancela este movimiento. Ambos registros quedarán en el historial — no se borra nada."
        confirmLabel="Anular"
        cancelLabel="Cancelar"
        variant="danger"
        loading={reversingId !== null}
        onConfirm={() => void handleReverseMovement()}
        onCancel={() => {
          if (reversingId === null) setConfirmReverse(null);
        }}
      />

      {/* ── Bulk stock modal ─────────────────────────────────────────────── */}
      {bulkModalOpen && (
        <BulkStockModal
          products={products.filter((p) => p.is_active)}
          onClose={() => setBulkModalOpen(false)}
          onSuccess={() => loadProducts(search, showInactive)}
        />
      )}

      {/* ── Movements Modal ──────────────────────────────────────────────── */}
      {movementsProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeMovements();
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Movimientos de inventario</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {movementsProduct.name} · Stock actual:{' '}
                  <strong
                    className={movementsProduct.stock_qty < 0 ? 'text-red-600' : 'text-slate-700'}
                  >
                    {movementsProduct.stock_qty.toLocaleString('es-VE')}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={closeMovements}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Register movement form */}
            <form
              onSubmit={handleRegisterMovement}
              className="px-5 py-4 border-b border-slate-100 space-y-3"
            >
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                Registrar movimiento manual
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
                  <div className="relative">
                    <select
                      value={movForm.kind}
                      onChange={(e) =>
                        setMovForm((prev) => ({
                          ...prev,
                          kind: e.target.value as typeof movForm.kind,
                        }))
                      }
                      className="w-full appearance-none text-xs border border-slate-200 rounded-lg py-2 px-3 outline-none focus:border-teal-400 bg-white pr-6"
                    >
                      {(Object.keys(KIND_LABELS) as Array<keyof typeof KIND_LABELS>).map((k) => (
                        <option key={k} value={k}>
                          {KIND_SIGN[k]} {KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={movForm.qty}
                    onChange={(e) => {
                      const v = e.target.value
                        .replace(/[^0-9.]/g, '')
                        .replace(/^(\d*\.?\d*).*$/, '$1');
                      setMovForm((prev) => ({ ...prev, qty: v }));
                    }}
                    placeholder="0"
                    required
                    className="w-full text-xs border border-slate-200 rounded-lg py-2 px-3 outline-none focus:border-teal-400 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nota</label>
                  <input
                    type="text"
                    value={movForm.note}
                    onChange={(e) => setMovForm((prev) => ({ ...prev, note: e.target.value }))}
                    placeholder="Opcional"
                    maxLength={500}
                    className="w-full text-xs border border-slate-200 rounded-lg py-2 px-3 outline-none focus:border-teal-400 bg-white placeholder:text-slate-300"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingMov || !movForm.qty}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)' }}
                >
                  {savingMov && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Registrar
                </button>
              </div>
            </form>

            {/* Movements list */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
              {loadingMovements ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                </div>
              ) : movements.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">
                  Sin movimientos registrados
                </p>
              ) : (
                (() => {
                  // Compute the set of movement IDs that have been reversed by a counter-entry.
                  // A movement with reverses_movement_id != null is the counter-entry itself;
                  // its target (reverses_movement_id) is the original "anulado" movement.
                  const reversedIds = new Set(
                    movements
                      .filter((m) => m.reverses_movement_id !== null)
                      .map((m) => m.reverses_movement_id!),
                  );

                  return movements.map((m) => {
                    const isReversal = m.reverses_movement_id !== null;
                    const isReversed = reversedIds.has(m.id);
                    const canReverse = !isReversal && !isReversed;

                    return (
                      <div
                        key={m.id}
                        className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                          isReversed
                            ? 'bg-slate-50 border-slate-100 opacity-50'
                            : isReversal
                              ? 'bg-amber-50 border-amber-100'
                              : 'bg-slate-50 border-slate-100'
                        }`}
                      >
                        <div className="shrink-0 mt-0.5">
                          {m.qty > 0 ? (
                            <ArrowDownToLine className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <ArrowUpFromLine className="w-4 h-4 text-rose-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${KIND_COLORS[m.kind]}`}
                            >
                              {KIND_UI_LABELS[m.kind]}
                            </span>
                            {isReversal && (
                              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                Anulación
                              </span>
                            )}
                            {isReversed && (
                              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500">
                                Anulado
                              </span>
                            )}
                            <span className="text-sm font-bold text-slate-800">
                              {m.qty > 0 ? '+' : ''}
                              {m.qty.toLocaleString('es-VE')}
                            </span>
                          </div>
                          {m.note && <p className="text-xs text-slate-500 mt-0.5">{m.note}</p>}
                          {m.consultation_id && (
                            <p className="text-[10px] text-slate-400 mt-0.5">Venta de consulta</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-slate-400">
                            {new Intl.DateTimeFormat('es-VE', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            }).format(new Date(m.created_at))}
                          </span>
                          {canReverse && (
                            <button
                              type="button"
                              onClick={() => setConfirmReverse(m)}
                              disabled={reversingId !== null}
                              title="Anular movimiento"
                              className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
