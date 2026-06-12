/**
 * lib/validation.ts — validaciones de formato reutilizables (cliente).
 *
 * El email es OPCIONAL en todo el sistema, pero CUANDO se especifica debe tener
 * un formato válido. Esta es la fuente única de la regex de email en el frontend.
 */

/** Regex de email: parte local + @ + dominio + TLD, sin espacios. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Devuelve true si `email` tiene un formato de email válido (tras trim). */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}
