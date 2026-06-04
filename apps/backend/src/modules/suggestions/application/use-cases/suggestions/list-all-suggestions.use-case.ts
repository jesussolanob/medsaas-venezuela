import { Inject, Injectable } from '@nestjs/common';
import type { Suggestion, SuggestionStatus } from '../../../domain/entities/suggestion.entity';
import {
  ISuggestionRepository,
  SUGGESTION_REPOSITORY,
} from '../../../domain/repositories/suggestion.repository';

export interface ListAllSuggestionsInput {
  status?: SuggestionStatus;
}

@Injectable()
export class ListAllSuggestionsUseCase {
  constructor(
    @Inject(SUGGESTION_REPOSITORY)
    private readonly suggestionRepo: ISuggestionRepository,
  ) {}

  async execute(input: ListAllSuggestionsInput): Promise<Suggestion[]> {
    return this.suggestionRepo.listAll({ status: input.status });
  }
}
