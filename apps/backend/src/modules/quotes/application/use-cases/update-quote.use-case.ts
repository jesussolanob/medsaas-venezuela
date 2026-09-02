import { Inject, Injectable } from '@nestjs/common';
import type { UpdateQuoteDto } from '@delta/shared-types';
import {
  QUOTE_REPOSITORY,
  type IQuoteRepository,
} from '../../domain/repositories/iquote.repository';
import type { Quote } from '../../domain/entities/quote.entity';
import { QuoteNotFoundError } from '../../domain/errors/quote-not-found.error';
import { QuoteAlreadySentError } from '../../domain/errors/quote-already-sent.error';
import { QuoteInvalidRecipientError } from '../../domain/errors/quote-invalid-recipient.error';
import { Quote as QuoteEntity } from '../../domain/entities/quote.entity';

/**
 * Updates an existing draft quote.
 *
 * Rules:
 *   - Only draft quotes can be updated.
 *   - Recipient change must preserve the XOR constraint.
 *   - If items are provided, they fully replace the existing items (replace-all).
 *   - sourceId validation runs whenever items are provided.
 *   - totalUsd is recomputed by the repository.
 */
@Injectable()
export class UpdateQuoteUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepo: IQuoteRepository,
  ) {}

  async execute(id: string, doctorId: string, dto: UpdateQuoteDto): Promise<Quote> {
    const existing = await this.quoteRepo.findByIdForDoctor(id, doctorId);
    if (!existing) {
      throw new QuoteNotFoundError();
    }
    if (!existing.canBeEdited()) {
      throw new QuoteAlreadySentError();
    }

    // Validate XOR recipient if either field is being changed
    if (dto.patient_id !== undefined || dto.lead_id !== undefined) {
      const newPatientId =
        dto.patient_id !== undefined ? (dto.patient_id ?? null) : existing.patientId;
      const newLeadId = dto.lead_id !== undefined ? (dto.lead_id ?? null) : existing.leadId;
      if (!QuoteEntity.hasValidRecipient(newPatientId, newLeadId)) {
        throw new QuoteInvalidRecipientError();
      }
    }

    // Validate sourceIds if items are being replaced
    if (dto.items) {
      await this.quoteRepo.validateItemSources(
        dto.items.map((it) => ({ kind: it.kind, sourceId: it.source_id ?? null })),
        doctorId,
      );
    }

    return this.quoteRepo.update(id, doctorId, {
      patientId: dto.patient_id !== undefined ? (dto.patient_id ?? null) : undefined,
      leadId: dto.lead_id !== undefined ? (dto.lead_id ?? null) : undefined,
      validUntil:
        dto.valid_until !== undefined
          ? dto.valid_until
            ? new Date(dto.valid_until)
            : null
          : undefined,
      notes: dto.notes,
      discountUsd: dto.discount_usd,
      items: dto.items?.map((it) => ({
        kind: it.kind,
        sourceId: it.source_id ?? null,
        name: it.name,
        description: it.description ?? '',
        quantity: it.quantity,
        unitPriceUsd: it.unit_price_usd,
        sortOrder: it.sort_order ?? 0,
      })),
    });
  }
}
