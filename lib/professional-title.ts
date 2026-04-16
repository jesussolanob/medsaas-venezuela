/**
 * Utility function to get the correct professional title
 * Falls back to deriving from specialty if title is not set
 */
export function getProfessionalTitle(title?: string | null, specialty?: string | null): string {
  // If title is explicitly set, use it
  if (title) return title

  // Otherwise, derive from specialty
  const s = (specialty || '').toLowerCase()

  if (s.includes('psicol') || s.includes('psico')) return 'Psic.'
  if (s.includes('odontol')) return 'Odont.'
  if (s.includes('nutri')) return 'Nutr.'
  if (s.includes('fisio')) return 'Fisio.'
  if (s.includes('licen')) return 'Lic.'

  // Default to Dr.
  return 'Dr.'
}
