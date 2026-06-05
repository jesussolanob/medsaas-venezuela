import { Inject, Injectable } from '@nestjs/common';
import {
  FINANCE_REPOSITORY,
  type IFinanceRepository,
} from '../../../domain/repositories/finance.repository';

export interface DeleteTransactionInput {
  transactionId: string;
  doctorId: string;
}

/**
 * Deletes a financial transaction owned by the calling doctor.
 *
 * SECURITY:
 *   - doctorId is taken from the authenticated user (anti-IDOR).
 *   - The repository enforces doctorId ownership on the WHERE clause.
 *   - Throws TransactionNotFoundError (404) when the id is not found or does not belong to the doctor.
 *   - Throws ForbiddenDomainError (403) when ownership fails (repo distinguishes these).
 */
@Injectable()
export class DeleteTransactionUseCase {
  constructor(
    @Inject(FINANCE_REPOSITORY)
    private readonly financeRepo: IFinanceRepository,
  ) {}

  async execute(input: DeleteTransactionInput): Promise<void> {
    await this.financeRepo.delete(input.transactionId, input.doctorId);
  }
}
