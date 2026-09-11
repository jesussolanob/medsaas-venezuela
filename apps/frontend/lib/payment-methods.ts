/**
 * lib/payment-methods.ts — labels amigables para los metodos de pago.
 *
 * Antes cada vista tenia su propio mapeo (cobros, finanzas, agenda, etc.) y
 * a veces se mostraba el valor crudo de BD ("cash_usd", "zelle"). Esto centraliza.
 *
 * Uso:
 *   import { formatPaymentMethod } from '@/lib/payment-methods'
 *   <span>{formatPaymentMethod(payment.method_snapshot)}</span>
 */

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  // VIGENTE: el vocabulario en espanol es el unico que se escribe desde la
  // migracion 20260911000001. Todo lo de abajo que no sea esto son alias de
  // LECTURA para filas viejas.
  efectivo: 'Efectivo',
  efectivo_usd: 'Efectivo (USD)',
  efectivo_bs: 'Efectivo (Bs)',
  // Alias de lectura: valores escritos antes de la unificacion.
  cash_usd: 'Efectivo (USD)',
  cash_bs: 'Efectivo (Bs)',
  transfer_bs: 'Transferencia (Bs)',
  debit_card: 'Tarjeta de Débito',
  credit_card: 'Tarjeta de Crédito',
  pago_movil: 'Pago Móvil',
  transferencia: 'Transferencia',
  transferencia_bs: 'Transferencia (Bs)',
  zelle: 'Zelle',
  binance: 'Binance',
  pos: 'POS',
  // Internos
  package: 'Paquete prepagado',
  insurance: 'Seguro médico',
  paid: 'Pagado',
  pending: 'Pendiente',
};

/**
 * Devuelve el label amigable. Si el metodo no esta mapeado, devuelve un
 * formato decente: snake_case → Title Case ("debit_card" → "Debit Card").
 */
export function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return '—';
  const key = method.toLowerCase().trim();
  if (PAYMENT_METHOD_LABELS[key]) return PAYMENT_METHOD_LABELS[key];
  // Fallback: snake_case → Title Case
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
