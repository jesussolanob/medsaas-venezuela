/**
 * lib/payment-methods.ts — vocabulario UNICO de metodos de pago del frontend.
 *
 * Antes cada vista tenia su propio mapeo (cobros, finanzas, agenda, etc.) y
 * a veces se mostraba el valor crudo de BD ("cash_usd", "zelle"). Esto centraliza.
 *
 * Uso:
 *   import { formatPaymentMethod } from '@/lib/payment-methods'
 *   <span>{formatPaymentMethod(payment.method_snapshot)}</span>
 */

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  // Aliases nuevos pedidos por producto
  cash_usd: 'Efectivo (USD)',
  cash_bs: 'Efectivo (Bs)',
  transfer_bs: 'Transferencia (Bs)',
  debit_card: 'Tarjeta de Débito',
  credit_card: 'Tarjeta de Crédito',
  // Aliases legacy del booking publico (snake_case espanol)
  efectivo: 'Efectivo',
  efectivo_usd: 'Efectivo (USD)',
  efectivo_bs: 'Efectivo (Bs)',
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

/**
 * Alias que se NORMALIZAN al vocabulario vigente (espanol).
 *
 * ⚠️ Convivian DOS vocabularios y se contradecian entre si: Configuracion, la
 * reserva publica y Cobros escribian `cash_usd`/`cash_bs`, mientras Consultas,
 * Agenda y Pacientes usaban `efectivo`/`efectivo_bs`.
 *
 * Como el selector de metodo al cobrar se filtra por `profiles.payment_methods`,
 * un especialista que aceptaba efectivo **no tenia la opcion al cobrar**: la
 * pantalla buscaba `efectivo` en una lista que decia `cash_usd`. Y una consulta
 * pagada en efectivo se abria mostrando "— Sin especificar —", perdiendo de vista
 * como habia dicho pagar el paciente.
 *
 * 🔑 **Se normaliza al LEER, no se migran los datos.** Una migracion sobre
 * `profiles.payment_methods` (TEXT[]) y `payment_details` (JSONB) con datos
 * reales de produccion es un riesgo que este arreglo no necesita correr: con la
 * normalizacion, los perfiles viejos funcionan sin que nadie los toque y la
 * forma nueva se escribe sola la proxima vez que el especialista guarde.
 */
export const PAYMENT_METHOD_ALIASES: Readonly<Record<string, string>> = {
  cash_usd: 'efectivo',
  cash_bs: 'efectivo_bs',
  efectivo_usd: 'efectivo',
  transfer_bs: 'transferencia',
  transferencia_bs: 'transferencia',
};

/**
 * Lleva un metodo al vocabulario vigente.
 *
 * Deja pasar lo que no reconoce en vez de descartarlo: filas viejas pueden tener
 * valores que ninguna pantalla escribe ya, y perderlos seria peor que mostrarlos
 * crudos.
 */
export function normalizePaymentMethod(method: string | null | undefined): string {
  if (!method) return '';
  const key = method.toLowerCase().trim();
  return PAYMENT_METHOD_ALIASES[key] ?? key;
}

/** Normaliza una lista y deduplica: `['cash_usd','efectivo']` → `['efectivo']`. */
export function normalizePaymentMethods(methods: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(methods)) return [];
  const out: string[] = [];
  for (const m of methods) {
    const n = normalizePaymentMethod(m);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Normaliza las CLAVES de `profiles.payment_details` (JSONB indexado por metodo).
 *
 * Va de la mano con `normalizePaymentMethods`: normalizar la lista y no las
 * claves deja los datos bancarios huerfanos — se buscarian bajo `efectivo`
 * mientras el JSONB los guarda bajo `cash_usd`, y el paciente recibiria el
 * metodo de pago sin a donde transferir.
 *
 * Si dos claves colapsan en la misma (`cash_usd` y `efectivo` a la vez), gana la
 * que YA estaba en el vocabulario vigente: es la que escribio la pantalla nueva.
 */
export function normalizePaymentDetailKeys<T = unknown>(
  details: Record<string, T> | null | undefined,
): Record<string, T> {
  if (!details || typeof details !== 'object') return {};

  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(details)) {
    const norm = normalizePaymentMethod(key);
    if (!norm) continue;
    // `key === norm` = ya estaba en el vocabulario vigente: pisa al alias.
    if (out[norm] === undefined || key === norm) out[norm] = value;
  }
  return out;
}
