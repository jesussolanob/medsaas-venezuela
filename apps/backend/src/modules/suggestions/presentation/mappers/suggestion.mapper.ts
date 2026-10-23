import type { Suggestion } from '../../domain/entities/suggestion.entity';
import type { SuggestionDoctorProfile } from '../../domain/repositories/suggestion-profile-lookup.repository';

/**
 * Maps a Suggestion domain entity to the API response shape.
 *
 * @param suggestion - Domain entity.
 * @param profile - Optional doctor profile for admin-facing responses.
 *   Pass undefined when the mapper is called from the doctor's own listing
 *   (doctor already knows who they are; exposing other doctors' PII would be
 *   an IDOR risk).
 */
export function toSuggestionResponse(
  suggestion: Suggestion,
  profile?: SuggestionDoctorProfile,
): Record<string, unknown> {
  return {
    id: suggestion.id,
    doctor_id: suggestion.doctorId,
    subject: suggestion.subject,
    message: suggestion.message,
    category: suggestion.category,
    status: suggestion.status,
    admin_response: suggestion.adminResponse,
    created_at: suggestion.createdAt.toISOString(),
    updated_at: suggestion.updatedAt.toISOString(),
    // profiles: only populated for admin-facing responses (super_admin only).
    // Undefined when called from the doctor's own listing.
    ...(profile !== undefined && {
      profiles: { full_name: profile.fullName, email: profile.email, specialty: profile.specialty },
    }),
  };
}
