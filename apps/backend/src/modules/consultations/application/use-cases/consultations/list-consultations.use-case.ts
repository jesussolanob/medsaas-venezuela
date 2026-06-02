import { Inject, Injectable } from '@nestjs/common';
import type { PaymentStatus } from '@delta/shared-types';
import type { ConsultationListResult } from '../../../domain/repositories/consultation.repository';
import {
  IConsultationRepository,
  CONSULTATION_REPOSITORY,
} from '../../../domain/repositories/consultation.repository';

export interface ListConsultationsInput {
  doctorId: string;
  dateFrom?: string;
  dateTo?: string;
  paymentStatus?: PaymentStatus;
  page: number;
  limit: number;
}

/**
 * Returns a paginated list of consultations for the authenticated doctor.
 *
 * Supports filtering by date range and payment status.
 * Clinical data is returned in plaintext (decrypted by the repository layer).
 */
@Injectable()
export class ListConsultationsUseCase {
  constructor(
    @Inject(CONSULTATION_REPOSITORY)
    private readonly repo: IConsultationRepository,
  ) {}

  async execute(input: ListConsultationsInput): Promise<ConsultationListResult> {
    return this.repo.list({
      doctorId: input.doctorId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      paymentStatus: input.paymentStatus,
      page: input.page,
      limit: input.limit,
    });
  }
}
