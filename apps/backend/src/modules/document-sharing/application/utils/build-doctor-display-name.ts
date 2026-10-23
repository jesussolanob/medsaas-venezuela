/**
 * Builds the doctor's display name for patient-facing emails:
 * "<professionalTitle> <fullName>" (trimmed), matching the frontend pattern
 * (ConsultationsClient, standalone-pdf, reminders).
 *
 * Falls back to the profile email when no fullName is set (e.g. during
 * onboarding), and to a generic label when there is no profile.
 */
export function buildDoctorDisplayName(
  profile: { fullName: string; professionalTitle: string | null; email: string } | null,
): string {
  if (profile?.fullName?.trim()) {
    const title = profile.professionalTitle?.trim() ?? '';
    const name = profile.fullName.trim();
    return title ? `${title} ${name}` : name;
  }
  return profile?.email ?? 'Su especialista';
}
