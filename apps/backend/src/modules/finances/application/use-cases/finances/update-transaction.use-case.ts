import { Inject, Injectable } from '@nestjs/common';
import {
  FINANCE_REPOSITORY,
  type IFinanceRepository,
} from '../../../domain/repositories/finance.repository';
import {
  INCOME_CONCEPT_REPOSITORY,
  type IIncomeConceptRepository,
} from '../../../domain/repositories/income-concept.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../../patients/domain/repositories/patient.repository';
import { Money, type Currency } from '../../../domain/value-objects/money.vo';
import { TransactionNotFoundError } from '../../../domain/errors/transaction-not-found.error';
import { ForbiddenDomainError } from '../../../domain/errors/forbidden-domain.error';
import { IncomeConceptNotFoundError } from '../../../domain/errors/income-concept-not-found.error';
import { InvalidAmountError } from '../../../domain/errors/invalid-amount.error';
import { PatientNotOwnedError } from '../../../domain/errors/patient-not-owned.error';

export interface UpdateTransactionInput {
  transactionId: string;
  doctorId: string;
  description?: string;
  amount?: number;
  currency?: Currency;
  transactionDate?: Date;
  /** Only for income transactions. Pass null to unlink. Undefined = keep existing. */
  conceptId?: string | null;
  /**
   * Only for income transactions. Pass null to unlink. Undefined = keep existing.
   * Validated for ownership when a non-null value is supplied.
   */
  patientId?: string | null;
}

export interface UpdateTransactionOutput {
  id: string;
  doctorId: string;
  type: 'income' | 'expense';
  amount: number;
  currency: Currency;
  description: string;
  relatedConsultationId: string | null;
  conceptId: string | null;
  patientId: string | null;
  date: Date;
  createdAt: Date;
}

/**
 * Edits an existing financial transaction (income or expense).
 *
 * Immutable fields: type, doctorId, relatedConsultationId.
 * conceptId and patientId are only accepted on income-type transactions.
 *
 * SECURITY:
 *   - doctorId is taken from the authenticated user (anti-IDOR).
 *   - Throws TransactionNotFoundError (404) if transaction is absent.
 *   - Throws ForbiddenDomainError (403) if it belongs to another doctor.
 *   - If conceptId is provided, validates it exists and belongs to the same doctor.
 *   - If patientId is provided, validates the patient belongs to the same doctor.
 */
@Injectable()
export class UpdateTransactionUseCase {
  constructor(
    @Inject(FINANCE_REPOSITORY)
    private readonly financeRepo: IFinanceRepository,
    @Inject(INCOME_CONCEPT_REPOSITORY)
    private readonly conceptRepo: IIncomeConceptRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(input: UpdateTransactionInput): Promise<UpdateTransactionOutput> {
    const transaction = await this.financeRepo.findById(input.transactionId, input.doctorId);
    if (!transaction) throw new TransactionNotFoundError();
    if (!transaction.isOwnedBy(input.doctorId))
      throw new ForbiddenDomainError('Transaction does not belong to this doctor');

    // Validate amount when provided.
    if (input.amount !== undefined && input.amount <= 0) {
      throw new InvalidAmountError(input.amount);
    }

    // Build the updated Money, merging new values over existing ones.
    const newCurrency = input.currency ?? transaction.amount.currency;
    const newAmount = input.amount ?? transaction.amount.amount;
    const money = new Money(newAmount, newCurrency);

    // Resolve conceptId only for income transactions.
    let resolvedConceptId: string | null | undefined = undefined;
    if (input.conceptId !== undefined) {
      if (transaction.type !== 'income') {
        // Silently ignore conceptId on expense transactions rather than erroring
        // — this keeps the endpoint lenient for frontend forms that always send the field.
        resolvedConceptId = undefined;
      } else if (input.conceptId === null) {
        resolvedConceptId = null;
      } else {
        const concept = await this.conceptRepo.findById(input.conceptId);
        if (!concept) throw new IncomeConceptNotFoundError();
        if (!concept.isOwnedBy(input.doctorId))
          throw new ForbiddenDomainError('Income concept does not belong to this doctor');
        resolvedConceptId = concept.id;
      }
    }

    // Resolve patientId only for income transactions.
    let resolvedPatientId: string | null | undefined = undefined;
    if (input.patientId !== undefined) {
      if (transaction.type !== 'income') {
        // Silently ignore patientId on expense transactions.
        resolvedPatientId = undefined;
      } else if (input.patientId === null) {
        resolvedPatientId = null;
      } else {
        const patient = await this.patientRepo.findById(input.patientId, input.doctorId);
        if (!patient) throw new PatientNotOwnedError();
        resolvedPatientId = patient.id;
      }
    }

    const patched = transaction.patch({
      amount: money,
      description: input.description,
      date: input.transactionDate,
      conceptId: resolvedConceptId,
      patientId: resolvedPatientId,
    });

    const saved = await this.financeRepo.updateTransaction(patched, input.doctorId);

    return {
      id: saved.id,
      doctorId: saved.doctorId,
      type: saved.type,
      amount: saved.amount.amount,
      currency: saved.amount.currency,
      description: saved.description,
      relatedConsultationId: saved.relatedConsultationId,
      conceptId: saved.conceptId,
      patientId: saved.patientId,
      date: saved.date,
      createdAt: saved.createdAt,
    };
  }
}
