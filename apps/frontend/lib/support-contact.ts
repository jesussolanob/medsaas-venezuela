/**
 * lib/support-contact.ts
 *
 * Single source of truth for the Delta Salud support contact number.
 *
 * Decision 2026-10-30: +58 422 103 3582 is the ONE support number used
 * everywhere in the product. It must not be hardcoded in individual files.
 *
 * Usage:
 *   import { SUPPORT_WHATSAPP_NUMBER, supportWhatsAppUrl } from '@/lib/support-contact'
 */

/** Support WhatsApp number — digits only, with country code. */
export const SUPPORT_WHATSAPP_NUMBER = '584221033582';

/** Human-readable formatted version of the support number. */
export const SUPPORT_WHATSAPP_DISPLAY = '+58 422 103 3582';

/**
 * Builds a wa.me URL for the support number with an optional message.
 * @param message - Pre-filled message text (plain, not encoded). Defaults to generic greeting.
 */
export function supportWhatsAppUrl(message?: string): string {
  const text = encodeURIComponent(
    message ?? 'Hola, soy especialista de Delta Salud y necesito ayuda.',
  );
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${text}`;
}
