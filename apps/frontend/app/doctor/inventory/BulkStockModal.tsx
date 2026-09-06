'use client';

/**
 * BulkStockModal
 *
 * Opens when the specialist clicks "Cargar stock". Shows all active products
 * with an optional quantity field each. Items with qty > 0 are sent as a
 * single atomic purchase batch to the backend.
 *
 * Use case: "me llegó mercancía, pongo las cantidades que me llegan de cada
 * uno y se suman a lo que ya está".
 */

import { useState, useTransition } from 'react';
import { X, PackagePlus, Loader2, ArrowRight } from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import { bulkLoadStock, type ProductRow } from './actions';

interface Props {
  /** Active products to display in the list. */
  products: ProductRow[];
  onClose: () => void;
  /** Called after a successful bulk load; parent should refresh the product list. */
  onSuccess: () => void;
}

export default function BulkStockModal({ products, onClose, onSuccess }: Props) {
  // qty values keyed by product id; empty string = no change
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  function setQty(productId: string, value: string) {
    // Allow only whole positive numbers
    const cleaned = value.replace(/[^0-9]/g, '');
    setQuantities((prev) => ({ ...prev, [productId]: cleaned }));
  }

  /** Items that have a positive qty typed in. */
  function validItems() {
    return products
      .filter((p) => {
        const qty = parseInt(quantities[p.id] ?? '', 10);
        return !isNaN(qty) && qty > 0;
      })
      .map((p) => ({
        product_id: p.id,
        qty: parseInt(quantities[p.id], 10),
      }));
  }

  const itemsToSend = validItems();
  const hasItems = itemsToSend.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasItems) {
      showToast({ type: 'error', message: 'Ingresá al menos una cantidad mayor a cero.' });
      return;
    }

    startTransition(async () => {
      const result = await bulkLoadStock({
        items: itemsToSend,
        note: note.trim() || undefined,
      });

      if (result.error) {
        // The backend rolls back if anything fails — communicate that clearly.
        showToast({
          type: 'error',
          message: `${result.error} — Esta operación es atómica: si algo falla, no se aplica nada.`,
        });
        return;
      }

      showToast({
        type: 'success',
        message: `Stock cargado: ${result.count ?? itemsToSend.length} ${
          (result.count ?? itemsToSend.length) === 1
            ? 'producto actualizado'
            : 'productos actualizados'
        }`,
      });
      onSuccess();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)' }}
            >
              <PackagePlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 id="bulk-modal-title" className="text-sm font-bold text-slate-800">
                Cargar stock
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Ingresá las cantidades que recibiste — se suman al stock actual
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Product list */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-1">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center pb-2 border-b border-slate-100">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                Producto
              </span>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide text-right w-16">
                Actual
              </span>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide text-center w-24">
                Cantidad
              </span>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide text-right w-20">
                Resultado
              </span>
            </div>

            {products.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">
                No hay productos activos en tu catálogo
              </p>
            ) : (
              products.map((p) => {
                const rawQty = quantities[p.id] ?? '';
                const parsedQty = parseInt(rawQty, 10);
                const incomingQty = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : 0;
                const projected = p.stock_qty + incomingQty;
                const hasQty = incomingQty > 0;

                return (
                  <div
                    key={p.id}
                    className={`grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center rounded-lg px-2 py-2.5 transition-colors ${
                      hasQty ? 'bg-teal-50 border border-teal-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Name */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                      {p.supplier && (
                        <p className="text-[10px] text-slate-400 truncate">{p.supplier}</p>
                      )}
                    </div>

                    {/* Current stock */}
                    <span
                      className={`text-sm font-semibold text-right w-16 ${
                        p.stock_qty < 0 ? 'text-red-600' : 'text-slate-600'
                      }`}
                    >
                      {p.stock_qty.toLocaleString('es-VE')}
                    </span>

                    {/* Quantity input */}
                    <input
                      type="text"
                      inputMode="numeric"
                      value={rawQty}
                      onChange={(e) => setQty(p.id, e.target.value)}
                      placeholder="0"
                      disabled={isPending}
                      className={`w-24 text-sm text-center border rounded-lg py-1.5 px-2 outline-none transition-all disabled:opacity-50 ${
                        hasQty
                          ? 'border-teal-300 bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400'
                          : 'border-slate-200 bg-white focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10'
                      }`}
                    />

                    {/* Projected stock */}
                    <div className="w-20 text-right">
                      {hasQty ? (
                        <span className="flex items-center justify-end gap-1 text-sm font-bold text-teal-700">
                          <ArrowRight className="w-3 h-3 shrink-0" />
                          {projected.toLocaleString('es-VE')}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-300">—</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Note + footer */}
          <div className="px-5 pb-5 pt-3 border-t border-slate-100 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Nota del lote <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej: Compra proveedor X — Factura 001"
                maxLength={500}
                disabled={isPending}
                className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 transition-all placeholder:text-slate-300 disabled:opacity-50"
              />
            </div>

            {hasItems && (
              <p className="text-[11px] text-slate-500">
                Se actualizarán <strong className="text-slate-700">{itemsToSend.length}</strong>{' '}
                {itemsToSend.length === 1 ? 'producto' : 'productos'} en una sola operación.
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending || !hasItems}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)' }}
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirmar carga
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
