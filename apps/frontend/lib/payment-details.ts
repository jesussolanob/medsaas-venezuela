/**
 * lib/payment-details.ts
 *
 * Los datos de cobro del especialista a SUS pacientes (`profiles.payment_details`).
 *
 * POR QUÉ EXISTE
 * --------------
 * Históricamente cada método guardaba UN solo juego de datos:
 *
 *     { pago_movil: { bank, phone, id_number, holder },
 *       transferencia: { bank, account, account_type, ... } }
 *
 * El dueño pidió poder cargar VARIOS pagos móviles y VARIAS cuentas bancarias
 * (2026-08-19): un especialista con cuentas en dos bancos hoy tiene que elegir
 * cuál publica, y el paciente que no tiene ese banco paga comisión o no paga.
 *
 * La forma nueva es una LISTA por método. Pero la columna es JSONB con datos
 * reales de producción, así que en vez de migrarla se acepta **cualquiera de las
 * dos formas al leer**: el objeto suelto se trata como una lista de un elemento.
 * Así no hace falta una migración de datos —que en este proyecto es lo que más
 * caro sale, porque una migración rota bloquea TODOS los despliegues— y un
 * perfil viejo sigue funcionando sin que nadie lo toque. La forma nueva se
 * escribe sola la primera vez que el especialista guarda.
 *
 * Regla: NADIE lee `payment_details[metodo]` directo. Se pasa por `entriesOf`.
 */

/** Un juego de datos de un método: campo → valor. */
export type PaymentEntry = Record<string, string>;

/** El JSONB completo, tal como puede venir de la BD (forma vieja o nueva). */
export type PaymentDetails = Record<string, unknown>;

/** Métodos que admiten más de un juego de datos. El resto se queda en uno. */
export const MULTI_ENTRY_METHODS = new Set(['pago_movil', 'transferencia']);

function isEntry(value: unknown): value is PaymentEntry {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deja solo los valores string: el resto no se puede mostrar como dato de pago. */
function sanitize(entry: PaymentEntry): PaymentEntry {
  const out: PaymentEntry = {};
  for (const [k, v] of Object.entries(entry)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/**
 * Juegos de datos de un método, SIEMPRE como lista.
 *
 * Acepta las dos formas y descarta las entradas vacías, para que un método que
 * quedó con `{}` de una edición a medias no pinte un bloque en blanco en el
 * booking ni una línea muda en el mensaje de cobro.
 */
export function entriesOf(
  details: PaymentDetails | null | undefined,
  method: string,
): PaymentEntry[] {
  const raw = details?.[method];
  if (raw == null) return [];

  const lista = Array.isArray(raw) ? raw : [raw];

  return lista
    .filter(isEntry)
    .map(sanitize)
    .filter((e) => Object.values(e).some((v) => v.trim() !== ''));
}

/**
 * Devuelve un `payment_details` NUEVO con la lista de un método reemplazada.
 *
 * Guarda una lista solo cuando hay más de una entrada; con una sola escribe el
 * objeto suelto, que es la forma que ya entienden todos los consumidores
 * antiguos (el booking, el mensaje de cobro y cualquier lectura que se nos
 * escape). Así la forma nueva aparece únicamente cuando de verdad hace falta.
 */
export function withEntries(
  details: PaymentDetails | null | undefined,
  method: string,
  entries: PaymentEntry[],
): PaymentDetails {
  const limpias = entries
    .map(sanitize)
    .filter((e) => Object.values(e).some((v) => v.trim() !== ''));

  const next: PaymentDetails = { ...(details ?? {}) };

  if (limpias.length === 0) {
    delete next[method];
  } else if (limpias.length === 1) {
    next[method] = limpias[0];
  } else {
    next[method] = limpias;
  }

  return next;
}

/**
 * Rótulo de una entrada cuando hay varias ("Banesco · 0414…").
 *
 * Sirve para que el paciente distinga una opción de otra sin leer todo el
 * bloque. Cae al número de orden cuando no hay ningún campo reconocible.
 */
export function entryLabel(entry: PaymentEntry, index: number): string {
  const partes = [entry.bank, entry.phone ?? entry.account, entry.email].filter(
    (v): v is string => !!v && v.trim() !== '',
  );
  return partes.length > 0 ? partes.join(' · ') : `Opción ${index + 1}`;
}
