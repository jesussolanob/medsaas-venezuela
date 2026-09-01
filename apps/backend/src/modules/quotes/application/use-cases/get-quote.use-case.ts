import { Inject, Injectable } from '@nestjs/common';
import {
  QUOTE_REPOSITORY,
  type IQuoteRepository,
} from '../../domain/repositories/iquote.repository';
import type { Quote } from '../../domain/entities/quote.entity';
import { QuoteNotFoundError } from '../../domain/errors/quote-not-found.error';

/**
 * Returns a single quote scoped to the authenticated doctor.
 *
 * Anti-IDOR: a foreign quote and a missing ID produce the same 404 error.
 * The repository scopes by (id, doctorId) and returns null for both cases.
 */
@Injectable()
export class GetQuoteUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepo: IQuoteRepository,
  ) {}

  async execute(id: string, doctorId: string): Promise<Quote> {
    const quote = await this.quoteRepo.findByIdForDoctor(id, doctorId);
    if (!quote) {
      throw new QuoteNotFoundError();
    }
    return quote;
  }
}
