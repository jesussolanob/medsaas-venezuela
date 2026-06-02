// L6 (2026-04-29): helpers de normalizacion / formateo de telefonos venezolanos.
//
// Formato canonico (lo que se almacena y lo que envia <PhoneInput>): 12 digitos
// arrancando con 58 + 10 digitos del numero local (ej: '584141234567').
//
// Para wa.me / api.whatsapp.com NO uses formatPhoneVE — pasa el canonico tal cual.
// formatPhoneVE solo es para mostrar al usuario.

/**
 * Devuelve el formato canonico '58XXXXXXXXXX' (12 digitos) si es valido,
 * o string vacio si no se puede parsear como telefono venezolano.
 *
 * Acepta:
 *   '04141234567'        → '584141234567'
 *   '+584141234567'      → '584141234567'
 *   '4141234567'         → '584141234567'
 *   '0414-1234567'       → '584141234567'
 *   '58 414 1234567'     → '584141234567'
 *   '584141234567'       → '584141234567'
 *
 * No valida que el operador (412/414/416/424/426) sea real, solo la longitud.
 */
export function normalizePhoneVE(input: string | null | undefined): string {
  if (!input) return ''
  const digits = String(input).replace(/\D/g, '')
  if (!digits) return ''

  // Caso 1: ya viene con prefijo 58 y 12 digitos exactos
  if (digits.startsWith('58') && digits.length === 12) return digits

  // Caso 2: formato local '0XXXXXXXXXX' (11 digitos arrancando con 0)
  if (digits.startsWith('0') && digits.length === 11) return '58' + digits.slice(1)

  // Caso 3: 10 digitos arrancando con 4 (sin 0 inicial, sin prefijo pais)
  if (digits.length === 10 && digits.startsWith('4')) return '58' + digits

  return ''
}

/**
 * Formatea un canonico '584141234567' → '+58 414-1234567' para mostrar al usuario.
 * Si recibe algo distinto, devuelve el input tal cual.
 *
 * NOTA: para wa.me / api.whatsapp.com, NO uses esta funcion — pasa el canonico
 * directo (sin '+', sin espacios, sin guiones).
 */
export function formatPhoneVE(canonical: string | null | undefined): string {
  if (!canonical) return ''
  const s = String(canonical)
  if (s.length !== 12 || !s.startsWith('58')) return s
  return `+${s.slice(0, 2)} ${s.slice(2, 5)}-${s.slice(5)}`
}

/**
 * Helper unico para construir links de wa.me con normalizacion segura.
 * Si el telefono no se puede normalizar, devuelve null.
 *
 * Ej:
 *   waLink('0414-1234567', 'Hola') → 'https://wa.me/584141234567?text=Hola'
 *   waLink('xxx', 'Hola')          → null
 */
export function waLink(phone: string | null | undefined, message?: string): string | null {
  const canonical = normalizePhoneVE(phone)
  if (!canonical) return null
  const base = `https://wa.me/${canonical}`
  if (!message) return base
  return `${base}?text=${encodeURIComponent(message)}`
}
