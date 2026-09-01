import { Inject, Injectable } from '@nestjs/common';
import type { UpdateQuoteStatusDto } from '@delta/shared-types';
import {
  QUOTE_REPOSITORY,
  type IQuoteRepository,
} from '../../domain/repositories/iquote.repository';
import type { Quote } from '../../domain/entities/quote.entity';
import { QuoteNotFoundError } from '../../domain/errors/quote-not-found.error';
import { QuoteInvalidStatusTransitionError } from '../../domain/errors/quote-invalid-status-transition.error';

/**
 * Updates the status of an existing quote (accepted | rejected | expired).
 *
 * State machine invariant: only sent quotes may transition to a terminal state.
 * draft → accepted/rejected/expired is REJECTED because those quotes have not
 * gone through markAsSent, so bcvRate / totalBs / sentAt would be NULL on an
 * "accepted" quote.
 *
 * Anti-IDOR: same error for missing and foreign quotes.
 */
@Injectable()
export class UpdateQuoteStatusUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepo: IQuoteRepository,
  ) {}

  async execute(id: string, doctorId: string, dto: UpdateQuoteStatusDto): Promise<Quote> {
    const existing = await this.quoteRepo.findByIdForDoctor(id, doctorId);
    if (!existing) {
      throw new QuoteNotFoundError();
    }

    if (!existing.canTransitionTo(dto.status)) {
      throw new QuoteInvalidStatusTransitionError(existing.status, dto.status);
    }

    return this.quoteRepo.updateStatus(id, doctorId, dto.status);
  }
}
