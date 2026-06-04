import type { Suggestion } from '../../domain/entities/suggestion.entity';

/**
 * Maps a Suggestion domain entity to the API response shape.
 */
export function toSuggestionResponse(suggestion: Suggestion): Record<string, unknown> {
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
  };
}
