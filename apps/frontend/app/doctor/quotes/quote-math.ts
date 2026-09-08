/**
 * Cálculo de los totales de un presupuesto — ESPEJO EXACTO del backend.
 *
 * ⚠️ Esto existe porque la vista previa y lo que se guarda tienen que dar el
 * MISMO número. El backend redondea el importe de CADA ítem a dos decimales
 * antes de sumarlos, y vuelve a redondear el subtotal:
 *
 *   sequelize-quote.repository.ts → buildItemsWithAmounts()
 *     amountUsd = round(quantity * unitPriceUsd)
 *   quote.entity.ts → computeTotals()
 *     subtotalUsd = round(Σ amountUsd)
 *
 * El frontend sumaba `cantidad × precio` en crudo. Con descuento por MONTO no
 * se notaba, porque el importe del descuento es el que tipeó el especialista.
 * Con PORCENTAJE el descuento se DERIVA del subtotal, así que un subtotal
 * distinto aplica el porcentaje sobre otra base:
 *
 *   Dos ítems de 0,145: 3×0,145 y 1×0,145.
 *   Backend  → 0,44 + 0,15 = 0,59 · 50% = $0,30 de descuento
 *   Frontend → 0,435 + 0,145 = 0,58 · 50% = $0,29 de descuento
 *
 * El especialista veía $0,29 antes de guardar y el presupuesto salía con $0,30.
 *
 * Si algún día cambia la regla en el backend, hay que cambiarla acá también.
 * Vive en un solo archivo justamente para que sea un único lugar donde mirar.
 */

import type { QuoteDiscountType } from './actions';

/** Redondeo a 2 decimales, igual que el backend. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Importe de una línea: cantidad × precio unitario, redondeado como el backend. */
export function itemAmount(quantity: number, unitPriceUsd: number): number {
  return round2((quantity || 0) * (unitPriceUsd || 0));
}

/** Suma de los importes ya redondeados, redondeada a su vez. */
export function computeSubtotal(
  items: Array<{ quantity: number; unit_price_usd: number }>,
): number {
  return round2(items.reduce((sum, it) => sum + itemAmount(it.quantity, it.unit_price_usd), 0));
}

/**
 * Descuento en dólares. Espejo de `Quote.computeDiscount()`:
 *   - 'percent' → el valor se acota a 0..100
 *   - 'amount'  → nunca negativo ni mayor que el subtotal
 */
export function computeDiscountUsd(
  subtotalUsd: number,
  discountType: QuoteDiscountType,
  discountValue: number,
): number {
  if (discountType === 'percent') {
    const clamped = Math.min(100, Math.max(0, discountValue || 0));
    return round2((subtotalUsd * clamped) / 100);
  }
  return Math.min(Math.max(0, discountValue || 0), subtotalUsd);
}

/** Total a pagar. Nunca negativo, igual que el backend. */
export function computeTotal(subtotalUsd: number, discountUsd: number): number {
  return round2(Math.max(0, subtotalUsd - discountUsd));
}
