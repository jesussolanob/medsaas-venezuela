/**
 * seller-referral.ts
 *
 * Guarda y recupera el código del vendedor que refirió a un especialista.
 *
 * ¿Por qué hace falta persistirlo? Entre que la persona abre el enlace del
 * vendedor y llega al onboarding se mete el login de Auth0, que se lleva puesto
 * cualquier parámetro de la URL. Sin guardarlo, el código se pierde en el camino
 * y la venta queda sin acreditar — que es justo lo que el enlace viene a evitar.
 *
 * Se usa `localStorage` a propósito y no una cookie: es un dato de marketing, no
 * de sesión, y así nunca viaja al servidor en cada request.
 */

const CLAVE = 'delta:seller-referral';

/** Mismo formato que valida el backend: 6 caracteres sin letras ambiguas. */
const FORMATO = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export function esCodigoValido(codigo: string): boolean {
  return FORMATO.test(codigo.trim().toUpperCase());
}

/** Guarda el código. Ignora los que no tienen el formato correcto. */
export function guardarReferido(codigo: string): void {
  if (typeof window === 'undefined') return;
  const limpio = codigo.trim().toUpperCase();
  if (!esCodigoValido(limpio)) return;
  try {
    window.localStorage.setItem(CLAVE, limpio);
  } catch {
    // Modo incógnito o storage lleno: el código igual se puede escribir a mano.
  }
}

/** Devuelve el código guardado, o null si no hay ninguno válido. */
export function leerReferido(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const guardado = window.localStorage.getItem(CLAVE);
    if (!guardado || !esCodigoValido(guardado)) return null;
    return guardado;
  } catch {
    return null;
  }
}

/**
 * Borra el código. Se llama al completar el alta: si el equipo es compartido
 * —una tablet del consultorio, por ejemplo— el próximo especialista que se
 * registre NO debe quedar acreditado al mismo vendedor.
 */
export function limpiarReferido(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {
    /* nada que hacer */
  }
}
