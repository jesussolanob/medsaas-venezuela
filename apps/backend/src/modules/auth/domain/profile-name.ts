/**
 * A sign-up with email + password reaches us without a real name: Auth0 fills
 * `name` with the email address. Storing it made the email show up as the
 * specialist's name everywhere (and the onboarding pre-filled it, so nobody
 * corrected it). These helpers keep that placeholder out of profiles.full_name.
 */
const PLACEHOLDER_NAMES = new Set(['', 'pendiente', 'unknown']);

export function isPlaceholderName(name: string | null | undefined): boolean {
  const value = (name ?? '').trim();
  return PLACEHOLDER_NAMES.has(value.toLowerCase()) || value.includes('@');
}

/** The name to store for a new profile: the real one, or empty until onboarding asks for it. */
export function profileNameOrEmpty(name: string | null | undefined): string {
  return isPlaceholderName(name) ? '' : (name ?? '').trim();
}
