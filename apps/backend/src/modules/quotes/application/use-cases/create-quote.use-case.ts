import { Inject, Injectable } from '@nestjs/common';
import type { CreateQuoteDto } from '@delta/shared-types';
import {
  QUOTE_REPOSITORY,
  type IQuoteRepository,
} from '../../domain/repositories/iquote.repository';
import { Quote } from '../../domain/entities/quote.entity';
import { QuoteInvalidRecipientError } from '../../domain/errors/quote-invalid-recipient.error';
import { ResolveQuoteRecipientPatientUseCase } from './resolve-quote-recipient-patient.use-case';

export type { Quote };

/**
 * CreateQuoteUseCase — creates a new draft quote with its snapshot items.
 *
 * Business rules enforced:
 *   1. Exactly one of patient_id / lead_id / new_recipient must be provided
 *      (XOR — new_recipient is resolved to a patient_id, see step 1b).
 *   2. If a sourceId is set on any item, the referenced catalog entry must exist
 *      and be owned by the doctor — enforced by repo.validateItemSources().
 *   3. totalUsd is always computed by the repository (never from the client).
 *   4. quote_number is generated atomically by the repository (advisory lock).
 *
 * The use case does NOT generate quote_number — that is the repository's job
 * to guarantee uniqueness under concurrent writes.
 */
@Injectable()
export class CreateQuoteUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepo: IQuoteRepository,
    private readonly resolveRecipient: ResolveQuoteRecipientPatientUseCase,
  ) {}

  async execute(dto: CreateQuoteDto, doctorId: string): Promise<Quote> {
    let patientId = dto.patient_id ?? null;
    const leadId = dto.lead_id ?? null;
    const newRecipient = dto.new_recipient ?? null;

    // 1a. Exactly one recipient shape must be provided. Checked BEFORE
    // resolving new_recipient — otherwise sending patient_id AND new_recipient
    // together would silently discard patient_id and quote whoever
    // new_recipient resolves to.
    const recipientCount = [patientId, leadId, newRecipient].filter((v) => v !== null).length;
    if (recipientCount !== 1) {
      throw new QuoteInvalidRecipientError();
    }

    // 1b. new_recipient never creates a duplicate: reuses the patient if the
    // cédula already exists for this doctor, creates one otherwise.
    if (newRecipient) {
      patientId = await this.resolveRecipient.execute(doctorId, newRecipient);
    }

    // 1c. Defensive re-check of the entity invariant now that new_recipient
    // has collapsed into a patientId.
    if (!Quote.hasValidRecipient(patientId, leadId)) {
      throw new QuoteInvalidRecipientError();
    }

    // 2. Validate sourceIds (throws QuoteItemSourceNotFoundError for any bad ref)
    await this.quoteRepo.validateItemSources(
      dto.items.map((it) => ({ kind: it.kind, sourceId: it.source_id ?? null })),
      doctorId,
    );

    // 3. Create — repo handles quote_number generation and total computation
    return this.quoteRepo.create({
      doctorId,
      patientId,
      leadId,
      validUntil: dto.valid_until ? new Date(dto.valid_until) : null,
      notes: dto.notes ?? '',
      discountType: dto.discount_type ?? 'amount',
      discountValue: dto.discount_value ?? 0,
      items: dto.items.map((it) => ({
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
