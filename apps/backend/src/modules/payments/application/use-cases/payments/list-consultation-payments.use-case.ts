import { Inject, Injectable } from '@nestjs/common';
import type {
  ConsultationPayment,
  PaymentStatus,
} from '../../../domain/entities/consultation-payment.entity';
import {
  IConsultationPaymentRepository,
  CONSULTATION_PAYMENT_REPOSITORY,
} from '../../../domain/repositories/consultation-payment.repository';

export interface ListConsultationPaymentsInput {
  doctorId: string;
  consultationId?: string;
  status?: PaymentStatus;
  limit: number;
  offset: number;
}

export interface ListConsultationPaymentsResult {
  items: ConsultationPayment[];
  total: number;
}

/**
 * Returns a paginated list of consultation payments for the authenticated doctor.
 *
 * SECURITY: doctorId is always taken from the authenticated user — the repository
 * scopes every query to doctorId, preventing cross-doctor data access (anti-IDOR).
 */
@Injectable()
export class ListConsultationPaymentsUseCase {
  constructor(
    @Inject(CONSULTATION_PAYMENT_REPOSITORY)
    private readonly repo: IConsultationPaymentRepository,
  ) {}

  async execute(input: ListConsultationPaymentsInput): Promise<ListConsultationPaymentsResult> {
    return this.repo.list({
      doctorId: input.doctorId,
      consultationId: input.consultationId,
      status: input.status,
      limit: input.limit,
      offset: input.offset,
    });
  }
}
