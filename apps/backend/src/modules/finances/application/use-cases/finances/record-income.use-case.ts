import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  FINANCE_REPOSITORY,
  type IFinanceRepository,
} from '../../../domain/repositories/finance.repository';
import {
  INCOME_CONCEPT_REPOSITORY,
  type IIncomeConceptRepository,
} from '../../../domain/repositories/income-concept.repository';
import { FinancialTransaction } from '../../../domain/entities/financial-transaction.entity';
import { Money, type Currency } from '../../../domain/value-objects/money.vo';
import { InvalidAmountError } from '../../../domain/errors/invalid-amount.error';
import { IncomeConceptNotFoundError } from '../../../domain/errors/income-concept-not-found.error';
import { ForbiddenDomainError } from '../../../domain/errors/forbidden-domain.error';

export interface RecordIncomeInput {
  doctorId: string;
  amount: number;
  currency: Currency;
  description: string;
  relatedConsultationId?: string | null;
  date?: Date;
  /** Optional link to an income_concept. Validated for ownership if present. */
  conceptId?: string | null;
}

export interface RecordIncomeOutput {
  id: string;
  doctorId: string;
  type: 'income';
  amount: number;
  currency: Currency;
  description: string;
  relatedConsultationId: string | null;
  conceptId: string | null;
  date: Date;
  createdAt: Date;
}

/**
 * Records a manual income entry for a doctor.
 *
 * Validation: amount > 0 is enforced by the Money value object constructor
 * (throws InvalidAmountError on violation).
 * If conceptId is provided, it must exist and belong to the same doctor.
 */
@Injectable()
export class RecordIncomeUseCase {
  constructor(
    @Inject(FINANCE_REPOSITORY)
    private readonly financeRepo: IFinanceRepository,
    @Inject(INCOME_CONCEPT_REPOSITORY)
    private readonly conceptRepo: IIncomeConceptRepository,
  ) {}

  async execute(input: RecordIncomeInput): Promise<RecordIncomeOutput> {
    if (input.amount <= 0) {
      throw new InvalidAmountError(input.amount);
    }
    const money = new Money(input.amount, input.currency);

    // Validate concept ownership when provided.
    let resolvedConceptId: string | null = null;
    if (input.conceptId) {
      const concept = await this.conceptRepo.findById(input.conceptId);
      if (!concept) throw new IncomeConceptNotFoundError();
      if (!concept.isOwnedBy(input.doctorId))
        throw new ForbiddenDomainError('Income concept does not belong to this doctor');
      resolvedConceptId = concept.id;
    }

    const transaction = FinancialTransaction.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      type: 'income',
      amount: money,
      description: input.description,
      relatedConsultationId: input.relatedConsultationId ?? null,
      date: input.date ?? new Date(),
      createdAt: new Date(),
      conceptId: resolvedConceptId,
    });

    const saved = await this.financeRepo.save(transaction);
    return this.toOutput(saved);
  }

  private toOutput(tx: FinancialTransaction): RecordIncomeOutput {
    return {
      id: tx.id,
      doctorId: tx.doctorId,
      type: 'income',
      amount: tx.amount.amount,
      currency: tx.amount.currency,
      description: tx.description,
      relatedConsultationId: tx.relatedConsultationId,
      conceptId: tx.conceptId,
      date: tx.date,
      createdAt: tx.createdAt,
    };
  }
}
