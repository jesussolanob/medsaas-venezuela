import { z } from 'zod';

/**
 * Vocabulario ÚNICO de métodos de pago.
 *
 * Existe porque convivieron DOS: la reserva pública y `/doctor/settings` escribían
 * `cash_usd`/`cash_bs` mientras Consultas, Agenda y Pacientes usaban
 * `efectivo`/`efectivo_bs`. Como el selector de método al cobrar se filtra por
 * `profiles.payment_methods`, el especialista abría una consulta pagada en efectivo
 * y no tenía la opción: perdía cómo dijo pagar el paciente. La migración
 * `20260911000001` unificó los datos; esto impide que vuelva a abrirse la grieta.
 *
 * Hasta ahora los DTO aceptaban `z.string()`, así que nada frenaba a una pantalla
 * nueva de inventar su propio vocabulario.
 */

/**
 * Métodos que una pantalla puede OFRECER hoy. Es la lista que ve el paciente en la
 * reserva pública y el especialista al cobrar.
 */
export const PAYMENT_METHODS = [
  'pago_movil',
  'transferencia',
  'zelle',
  'binance',
  'efectivo',
  'efectivo_bs',
  'pos',
  'seguro',
] as const;

/**
 * Valores que pone el SISTEMA, no el usuario: no se ofrecen en ningún selector.
 *   package   — la sesión sale de un paquete prepago, no genera cobro nuevo.
 *   insurance — la reserva se hizo declarando un seguro.
 */
export const SYSTEM_PAYMENT_METHODS = ['package', 'insurance'] as const;

/**
 * Tolerados por compatibilidad: existen en filas viejas y ninguna pantalla los
 * escribe ya. Se aceptan para que reabrir y volver a guardar una consulta
 * histórica no reviente con un 422 — que sería romper algo que hoy funciona.
 */
export const LEGACY_PAYMENT_METHODS = ['manual'] as const;

/**
 * Alias que se NORMALIZAN al vocabulario vigente en vez de rechazarse.
 *
 * Normalizar y no rechazar es deliberado: un cliente viejo en caché, o un reenvío
 * de una fila que se escapó de la migración, se corrige solo y converge. Rechazar
 * dejaría al especialista sin poder guardar, que es peor que el problema original.
 */
export const PAYMENT_METHOD_ALIASES: Readonly<Record<string, string>> = {
  cash_usd: 'efectivo',
  cash_bs: 'efectivo_bs',
  efectivo_usd: 'efectivo',
  transfer_bs: 'transferencia',
  transferencia_bs: 'transferencia',
};

/** Todo lo que se puede almacenar, ya normalizado. */
export const STORABLE_PAYMENT_METHODS = [
  ...PAYMENT_METHODS,
  ...SYSTEM_PAYMENT_METHODS,
  ...LEGACY_PAYMENT_METHODS,
] as const;

export type PaymentMethodValue = (typeof STORABLE_PAYMENT_METHODS)[number];

/** Aplica alias y normaliza mayúsculas/espacios. Deja pasar lo que no reconoce. */
export function normalizePaymentMethod(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const key = value.trim().toLowerCase();
  return PAYMENT_METHOD_ALIASES[key] ?? key;
}

const ERROR_METODO = `Método de pago no reconocido. Los válidos son: ${PAYMENT_METHODS.join(', ')}.`;

/**
 * Esquema de un método de pago que se ALMACENA (incluye los del sistema y los
 * tolerados). Normaliza antes de validar.
 */
export const PaymentMethodSchema = z.preprocess(
  normalizePaymentMethod,
  z.enum(STORABLE_PAYMENT_METHODS, { error: ERROR_METODO }),
);

/**
 * Esquema para los métodos que el ESPECIALISTA declara aceptar
 * (`profiles.payment_methods`). No admite `package` ni `insurance`: no son algo
 * que se ofrezca a un paciente, y aceptarlos ahí los haría aparecer como botón
 * en la reserva pública.
 */
export const OfferablePaymentMethodSchema = z.preprocess(
  normalizePaymentMethod,
  z.enum(PAYMENT_METHODS, { error: ERROR_METODO }),
);
