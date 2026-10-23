'use client';

/**
 * PresupuestoItemsEditor.tsx
 *
 * Controlled editor for presupuesto (budget) content templates.
 * Allows adding items from the doctor's services/products catalog or as manual items.
 * Catalog items store kind + source_id + name + description + quantity (NO price, per spec).
 * Manual items also store unit_price_usd.
 *
 * Props:
 *   value    — current PresupuestoTemplateContent state
 *   onChange — called with the new value whenever anything changes
 *   options  — services and products catalog for dropdown selection
 */

import { X, Plus } from 'lucide-react';
import type {
  PresupuestoTemplateContent,
  PresupuestoTemplateItem,
} from '@/app/doctor/templates/content-actions';

// ---------------------------------------------------------------------------
// Catalog option types (mirror QuoteCreateModal shape)
// ---------------------------------------------------------------------------

export interface CatalogService {
  id: string;
  name: string;
  price_usd: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  sale_price_amount: number;
  sale_price_currency: 'USD' | 'VES';
}

export interface PresupuestoEditorOptions {
  services: CatalogService[];
  products: CatalogProduct[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newManualItem(): PresupuestoTemplateItem {
  return {
    kind: 'manual',
    source_id: null,
    name: '',
    description: '',
    quantity: 1,
    unit_price_usd: 0,
  };
}

const KIND_BADGE: Record<PresupuestoTemplateItem['kind'], { label: string; className: string }> = {
  service: { label: 'S', className: 'bg-teal-50 text-teal-700' },
  product: { label: 'P', className: 'bg-violet-50 text-violet-700' },
  manual: { label: 'M', className: 'bg-slate-200 text-slate-700' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PresupuestoItemsEditorProps {
  value: PresupuestoTemplateContent;
  onChange: (v: PresupuestoTemplateContent) => void;
  options?: PresupuestoEditorOptions;
}

export function PresupuestoItemsEditor({ value, onChange, options }: PresupuestoItemsEditorProps) {
  function updateItem(idx: number, patch: Partial<PresupuestoTemplateItem>) {
    const items = value.items.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    onChange({ items });
  }

  function removeItem(idx: number) {
    onChange({ items: value.items.filter((_, i) => i !== idx) });
  }

  function addManual() {
    onChange({ items: [...value.items, newManualItem()] });
  }

  function addFromService(svc: CatalogService) {
    const item: PresupuestoTemplateItem = {
      kind: 'service',
      source_id: svc.id,
      name: svc.name,
      description: '',
      quantity: 1,
      // Price deliberately NOT stored — resolved at apply time per spec F.
    };
    onChange({ items: [...value.items, item] });
  }

  function addFromProduct(prod: CatalogProduct) {
    const item: PresupuestoTemplateItem = {
      kind: 'product',
      source_id: prod.id,
      name: prod.name,
      description: '',
      quantity: 1,
      // Price deliberately NOT stored — resolved at apply time per spec F.
    };
    onChange({ items: [...value.items, item] });
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
        Los precios de servicios y productos se toman del catálogo actual al aplicar la plantilla,
        no se guardan aquí. Solo los ítems manuales guardan precio.
      </div>

      {/* Add buttons row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Agregar:
        </span>

        {/* Services dropdown */}
        <details className="relative">
          <summary className="list-none cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Servicio
          </summary>
          <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-10 max-h-52 overflow-y-auto">
            {(options?.services ?? []).map((svc) => (
              <button
                key={svc.id}
                type="button"
                onClick={(e) => {
                  addFromService(svc);
                  (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
                }}
                className="w-full text-left px-3 py-2.5 text-xs hover:bg-slate-50 transition-colors"
              >
                <div className="font-semibold text-slate-800">{svc.name}</div>
                <div className="text-slate-400 text-[10px]">Precio actual al aplicar plantilla</div>
              </button>
            ))}
            {!options?.services.length && (
              <p className="px-3 py-3 text-xs text-slate-400">Sin servicios</p>
            )}
          </div>
        </details>

        {/* Products dropdown */}
        <details className="relative">
          <summary className="list-none cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Producto
          </summary>
          <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-10 max-h-52 overflow-y-auto">
            {(options?.products ?? []).map((prod) => (
              <button
                key={prod.id}
                type="button"
                onClick={(e) => {
                  addFromProduct(prod);
                  (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
                }}
                className="w-full text-left px-3 py-2.5 text-xs hover:bg-slate-50 transition-colors"
              >
                <div className="font-semibold text-slate-800">{prod.name}</div>
                <div className="text-slate-400 text-[10px]">Precio actual al aplicar plantilla</div>
              </button>
            ))}
            {!options?.products.length && (
              <p className="px-3 py-3 text-xs text-slate-400">Sin productos en inventario</p>
            )}
          </div>
        </details>

        {/* Manual item */}
        <button
          type="button"
          onClick={addManual}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Manual
        </button>
      </div>

      {/* Items list */}
      {value.items.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-xl">
          Sin ítems — agrega servicios, productos o ítems manuales arriba.
        </p>
      )}

      <div className="space-y-2">
        {value.items.map((item, idx) => (
          <div
            key={idx}
            className="grid grid-cols-12 gap-2 items-start p-3 border border-slate-100 rounded-xl bg-slate-50"
          >
            {/* Kind badge */}
            <div className="col-span-1 flex justify-center pt-2">
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${KIND_BADGE[item.kind].className}`}
              >
                {KIND_BADGE[item.kind].label}
              </span>
            </div>

            {/* Name + Description */}
            <div className="col-span-5 space-y-1.5">
              <input
                type="text"
                value={item.name}
                onChange={(e) => updateItem(idx, { name: e.target.value })}
                placeholder="Nombre del ítem"
                disabled={item.kind !== 'manual'}
                className="w-full text-xs border border-slate-200 rounded-lg py-2 px-2.5 outline-none focus:border-teal-400 bg-white placeholder:text-slate-300 disabled:opacity-60 disabled:bg-slate-50"
              />
              <input
                type="text"
                value={item.description}
                onChange={(e) => updateItem(idx, { description: e.target.value })}
                placeholder="Descripción (opcional)"
                className="w-full text-xs border border-slate-200 rounded-lg py-2 px-2.5 outline-none focus:border-teal-400 bg-white placeholder:text-slate-300"
              />
            </div>

            {/* Quantity */}
            <div className="col-span-2">
              <input
                type="text"
                inputMode="decimal"
                value={item.quantity}
                onChange={(e) => {
                  const v = Math.max(1, parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 1);
                  updateItem(idx, { quantity: v });
                }}
                placeholder="Cant."
                className="w-full text-xs border border-slate-200 rounded-lg py-2 px-2.5 outline-none focus:border-teal-400 bg-white text-right"
              />
            </div>

            {/* Price (manual only) */}
            <div className="col-span-3">
              {item.kind === 'manual' ? (
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.unit_price_usd ?? ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0;
                      updateItem(idx, { unit_price_usd: v });
                    }}
                    placeholder="0.00"
                    className="w-full text-xs border border-slate-200 rounded-lg py-2 pl-5 pr-2.5 outline-none focus:border-teal-400 bg-white text-right"
                  />
                </div>
              ) : (
                <div className="py-2 px-2.5 text-xs text-slate-400 italic">Precio actual</div>
              )}
            </div>

            {/* Remove */}
            <div className="col-span-1 flex justify-center pt-2">
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="text-red-400 hover:text-red-600 transition-colors"
                aria-label={`Eliminar ítem ${idx + 1}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
