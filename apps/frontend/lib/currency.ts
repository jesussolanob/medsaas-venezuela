/**
 * Divisa en la que el especialista MUESTRA sus precios.
 *
 * Módulo deliberadamente sin dependencias: lo importan tanto código de servidor
 * como `components/pdf/QuotePdf.tsx`, que también se renderiza en el navegador
 * (`pdf().toBlob()`). Si esto viviera en `lib/bcv-rate.ts`, el PDF se llevaría
 * al bundle del cliente todo el código que consulta y raspa las fuentes de la
 * tasa, que no necesita para nada.
 */

/** `profiles.currency_mode`. */
export type CurrencyMode = 'usd_bcv' | 'eur_bcv' | 'custom';

/**
 * Símbolo y código de la divisa del especialista.
 *
 * ⚠️ La divisa cambia lo que se MUESTRA, no lo que se guarda (ADR-034): es el
 * mismo número con otro símbolo, no hay conversión de por medio. Lo que sí
 * cambia es la TASA con la que se calcula el equivalente en bolívares — eso lo
 * resuelve `resolveRateForCurrencyMode` en `lib/bcv-rate.ts`.
 *
 * Vive en un solo lugar porque la decisión estaba copiada en tres (vista
 * pública del presupuesto, PDF y listado) y el listado se había quedado atrás,
 * mostrando `$` fijo a especialistas que trabajan en euros.
 */
export function currencyOf(mode: string | null | undefined): { symbol: string; code: string } {
  return mode === 'eur_bcv' ? { symbol: '€', code: 'EUR' } : { symbol: '$', code: 'USD' };
}
