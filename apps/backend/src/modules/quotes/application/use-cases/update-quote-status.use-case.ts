import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { UpdateQuoteStatusDto } from '@delta/shared-types';
import {
  QUOTE_REPOSITORY,
  type IQuoteRepository,
} from '../../domain/repositories/iquote.repository';
import type { Quote } from '../../domain/entities/quote.entity';
import { QuoteNotFoundError } from '../../domain/errors/quote-not-found.error';
import { QuoteInvalidStatusTransitionError } from '../../domain/errors/quote-invalid-status-transition.error';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../../finances/domain/repositories/payment.repository';

/**
 * Updates the status of an existing quote (accepted | rejected | expired).
 *
 * State machine invariant: only sent quotes may transition to a terminal state.
 * draft → accepted/rejected/expired is REJECTED because those quotes have not
 * gone through markAsSent, so bcvRate / totalBs / sentAt would be NULL on an
 * "accepted" quote.
 *
 * On acceptance of a patient quote (patientId IS NOT NULL):
 *   A pending payment is created atomically via quoteRepo.acceptWithPayment.
 *   The payment and the status update share a single DB transaction so a
 *   concurrent double-accept cannot generate two payment rows (ADR-058).
 *
 * On acceptance of a lead quote (patientId IS NULL):
 *   payments.patient_id is NOT NULL — the payment cannot be created without a
 *   real patient. The status transition proceeds normally without creating a
 *   payment; a warning is logged (no PII). The specialist must convert the lead
 *   to a patient to enable billing.
 *
 * Anti-IDOR: same error for missing and foreign quotes.
 */
@Injectable()
export class UpdateQuoteStatusUseCase {
  private readonly logger = new Logger(UpdateQuoteStatusUseCase.name);

  constructor(
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepo: IQuoteRepository,
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
  ) {}

  async execute(id: string, doctorId: string, dto: UpdateQuoteStatusDto): Promise<Quote> {
    const existing = await this.quoteRepo.findByIdForDoctor(id, doctorId);
    if (!existing) {
      throw new QuoteNotFoundError();
    }

    if (!existing.canTransitionTo(dto.status)) {
      throw new QuoteInvalidStatusTransitionError(existing.status, dto.status);
    }

    let updated: Quote;

    if (dto.status === 'accepted' && existing.patientId !== null) {
      // Payment creation is atomic with the status update (ADR-058).
      updated = await this.quoteRepo.acceptWithPayment(id, doctorId, {
        paymentId: randomUUID(),
        patientId: existing.patientId,
        amountUsd: existing.totalUsd,
        paymentCode: existing.quoteNumber,
      });
    } else {
      if (dto.status === 'accepted' && existing.patientId === null) {
        // Lead quote: payments.patient_id is NOT NULL — skip payment creation.
        // The specialist needs to convert the lead to a patient first.
        this.logger.warn(
          `[update-quote-status] quote ${id} accepted without payment — lead quote has no patient`,
        );
      }

      // Mismo criterio que la ruta pública: el estado leído entra en el WHERE.
      updated = await this.quoteRepo.updateStatus(id, doctorId, dto.status, existing.status);
    }

    /*
      Acá NO se emite notificación a propósito.

      Este camino es `PUT /api/doctor/quotes/:id/status`: lo dispara el propio
      especialista marcando el presupuesto como aceptado o rechazado. Avisarle
      por la campana de algo que acaba de hacer él mismo es ruido, y encima
      enciende el punto de "no leídas", que tiene que significar "pasó algo que
      no viste".

      La notificación sí se emite en el camino PÚBLICO
      (`update-public-quote-status`), que es cuando decide el PACIENTE — el
      evento que el especialista no está mirando y que de verdad necesita que
      le avisen.
    */
    return updated;
  }
}
