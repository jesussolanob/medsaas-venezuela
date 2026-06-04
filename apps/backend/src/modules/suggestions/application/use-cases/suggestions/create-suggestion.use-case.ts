import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Suggestion } from '../../../domain/entities/suggestion.entity';
import {
  ISuggestionRepository,
  SUGGESTION_REPOSITORY,
} from '../../../domain/repositories/suggestion.repository';

export interface CreateSuggestionInput {
  doctorId: string;
  subject: string;
  message: string;
  category?: string;
}

@Injectable()
export class CreateSuggestionUseCase {
  constructor(
    @Inject(SUGGESTION_REPOSITORY)
    private readonly suggestionRepo: ISuggestionRepository,
  ) {}

  async execute(input: CreateSuggestionInput): Promise<Suggestion> {
    const now = new Date();
    const suggestion = Suggestion.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      subject: input.subject,
      message: input.message,
      category: input.category ?? 'general',
      status: 'pending',
      adminResponse: null,
      createdAt: now,
      updatedAt: now,
    });

    return this.suggestionRepo.create(suggestion);
  }
}
