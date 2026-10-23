import { Inject, Injectable } from '@nestjs/common';
import type { Suggestion, SuggestionStatus } from '../../../domain/entities/suggestion.entity';
import {
  ISuggestionRepository,
  SUGGESTION_REPOSITORY,
} from '../../../domain/repositories/suggestion.repository';
import {
  SUGGESTION_PROFILE_LOOKUP_REPOSITORY,
  type ISuggestionProfileLookupRepository,
  type SuggestionDoctorProfile,
} from '../../../domain/repositories/suggestion-profile-lookup.repository';

export interface ListAllSuggestionsInput {
  status?: SuggestionStatus;
}

export interface ListAllSuggestionsResult {
  suggestions: Suggestion[];
  /** Keyed by doctorId. Missing entry means the profile was not found. */
  profiles: Map<string, SuggestionDoctorProfile>;
}

/**
 * Lists all suggestions across all doctors (admin use case).
 *
 * Also resolves doctor identity (name, email, specialty) in a single batched
 * query — no N+1. The enriched profiles map is returned so the controller can
 * build full response rows without additional queries.
 *
 * SECURITY: doctor name/email/specialty are doctor PII. This use case must only
 * be called from super_admin-guarded endpoints.
 */
@Injectable()
export class ListAllSuggestionsUseCase {
  constructor(
    @Inject(SUGGESTION_REPOSITORY)
    private readonly suggestionRepo: ISuggestionRepository,
    @Inject(SUGGESTION_PROFILE_LOOKUP_REPOSITORY)
    private readonly profileLookup: ISuggestionProfileLookupRepository,
  ) {}

  async execute(input: ListAllSuggestionsInput): Promise<ListAllSuggestionsResult> {
    const suggestions = await this.suggestionRepo.listAll({ status: input.status });

    // Collect distinct doctorIds and fetch profiles in one query (no N+1).
    const distinctDoctorIds = [...new Set(suggestions.map((s) => s.doctorId))];
    const profileRows = await this.profileLookup.findByIds(distinctDoctorIds);

    const profiles = new Map<string, SuggestionDoctorProfile>(profileRows.map((p) => [p.id, p]));

    return { suggestions, profiles };
  }
}
