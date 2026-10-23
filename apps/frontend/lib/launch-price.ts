/**
 * launch-price.ts
 *
 * Helper de precio de lanzamiento / promo.
 *
 * Un plan está en promo cuando compare_at_price > price_usd.
 * Esta es exactamente la misma condición que usa el backend al emitir el campo
 * compare_at_price: solo llega cuando es mayor al precio real.
 *
 * La misma lógica se duplica en vanilla JS dentro de landing.html (que no puede
 * importar módulos TypeScript). Si se modifica esta función, actualizar también
 * la función launchPromo() en apps/frontend/public/landing.html.
 *
 * Uso:
 *   import { getLaunchPromo } from '@/lib/launch-price';
 *   const promo = getLaunchPromo(price, compareAt);
 *   if (promo) {
 *     // mostrar badge y `promo.savingsPct`
 *   }
 */

export interface LaunchPromo {
  readonly isPromo: true;
  /** Porcentaje de ahorro redondeado: round((compareAt − price) / compareAt × 100). */
  readonly savingsPct: number;
}

/**
 * Retorna la info de promo cuando compare_at > price_usd, null en caso contrario.
 *
 * @param priceUsd   Precio real (número, ya validado como > 0 antes de llamar).
 * @param compareAt  Precio de referencia tachado (number | null | undefined).
 */
export function getLaunchPromo(
  priceUsd: number,
  compareAt: number | null | undefined,
): LaunchPromo | null {
  if (compareAt == null || compareAt <= priceUsd) return null;
  const savingsPct = Math.round(((compareAt - priceUsd) / compareAt) * 100);
  return { isPromo: true, savingsPct };
}
