import { Inject, Injectable } from '@nestjs/common';
import {
  BILLING_DOCUMENT_REPOSITORY,
  type IBillingDocumentRepository,
  type BillingDocumentListResult,
} from '../../../domain/repositories/billing-document.repository';

export interface ListBillingDocumentsInput {
  doctorId: string;
  page?: number;
  limit?: number;
}

/**
 * Lists billing documents for the authenticated doctor (anti-IDOR: scoped by doctorId).
 */
@Injectable()
export class ListBillingDocumentsUseCase {
  constructor(
    @Inject(BILLING_DOCUMENT_REPOSITORY)
    private readonly repo: IBillingDocumentRepository,
  ) {}

  async execute(input: ListBillingDocumentsInput): Promise<BillingDocumentListResult> {
    return this.repo.listForDoctor({
      doctorId: input.doctorId,
      page: Math.max(1, input.page ?? 1),
      limit: Math.min(100, Math.max(1, input.limit ?? 20)),
    });
  }
}
