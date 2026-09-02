import { Inject, Injectable } from '@nestjs/common';
import {
  QUOTE_REPOSITORY,
  type IQuoteRepository,
} from '../../domain/repositories/iquote.repository';
import { QuoteNotFoundError } from '../../domain/errors/quote-not-found.error';
import { QuoteAlreadySentError } from '../../domain/errors/quote-already-sent.error';

/**
 * Deletes a draft quote. Only draft quotes may be deleted.
 *
 * Anti-IDOR: same QuoteNotFoundError for missing and foreign quotes.
 */
@Injectable()
export class DeleteQuoteUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepo: IQuoteRepository,
  ) {}

  async execute(id: string, doctorId: string): Promise<void> {
    const existing = await this.quoteRepo.findByIdForDoctor(id, doctorId);
    if (!existing) {
      throw new QuoteNotFoundError();
    }
    if (!existing.canBeEdited()) {
      throw new QuoteAlreadySentError();
    }
    await this.quoteRepo.delete(id, doctorId);
  }
}
