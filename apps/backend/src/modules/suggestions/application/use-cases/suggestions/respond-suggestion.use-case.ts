import { Inject, Injectable } from '@nestjs/common';
import type { Suggestion, SuggestionStatus } from '../../../domain/entities/suggestion.entity';
import { SuggestionNotFoundError } from '../../../domain/errors/suggestion-not-found.error';
import {
  ISuggestionRepository,
  SUGGESTION_REPOSITORY,
} from '../../../domain/repositories/suggestion.repository';

export interface RespondSuggestionInput {
  suggestionId: string;
  status: SuggestionStatus;
  adminResponse?: string | null;
}

@Injectable()
export class RespondSuggestionUseCase {
  constructor(
    @Inject(SUGGESTION_REPOSITORY)
    private readonly suggestionRepo: ISuggestionRepository,
  ) {}

  async execute(input: RespondSuggestionInput): Promise<Suggestion> {
    const existing = await this.suggestionRepo.findById(input.suggestionId);
    if (!existing) {
      throw new SuggestionNotFoundError();
    }

    // Domain entity enforces status validity — throws SuggestionInvalidStatusError if invalid.
    const updated = existing.respond(input.status, input.adminResponse ?? null);

    return this.suggestionRepo.save(updated);
  }
}
