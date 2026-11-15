/**
 * Display helpers for phone numbers stored in canonical form (country code +
 * local number, digits only, e.g. '584141234567') — what onboarding stores.
 */

const MIN_DIGITS = 8;
const MAX_DIGITS = 15;
const VE_CANONICAL = /^58(\d{3})(\d{7})$/;

function digitsOf(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '');
}

/**
 * Human-readable international number with the leading "+":
 *   '584141234567' → '+58 414-1234567'; other countries → '+<digits>'.
 * Returns '' when the value does not look like a phone number.
 */
export function formatPhoneInternational(phone: string | null | undefined): string {
  const digits = digitsOf(phone);
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return '';
  const ve = VE_CANONICAL.exec(digits);
  return ve ? `+58 ${ve[1]}-${ve[2]}` : `+${digits}`;
}

/**
 * Value for a `tel:` link ('+584141234567'), so tapping the number on a phone
 * offers to call or message. Returns '' when the value is not a phone number.
 */
export function phoneTelUri(phone: string | null | undefined): string {
  const digits = digitsOf(phone);
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return '';
  return `+${digits}`;
}
