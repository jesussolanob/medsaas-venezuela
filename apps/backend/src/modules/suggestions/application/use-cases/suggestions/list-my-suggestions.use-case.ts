import { Inject, Injectable } from '@nestjs/common';
import type { Suggestion } from '../../../domain/entities/suggestion.entity';
import {
  ISuggestionRepository,
  SUGGESTION_REPOSITORY,
} from '../../../domain/repositories/suggestion.repository';

export interface ListMySuggestionsInput {
  doctorId: string;
}

@Injectable()
export class ListMySuggestionsUseCase {
  constructor(
    @Inject(SUGGESTION_REPOSITORY)
    private readonly suggestionRepo: ISuggestionRepository,
  ) {}

  async execute(input: ListMySuggestionsInput): Promise<Suggestion[]> {
    return this.suggestionRepo.listForDoctor(input.doctorId);
  }
}
