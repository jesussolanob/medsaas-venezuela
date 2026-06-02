import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  FINANCE_REPOSITORY,
  type IFinanceRepository,
} from '../../../domain/repositories/finance.repository';
import { FinancialTransaction } from '../../../domain/entities/financial-transaction.entity';
import { Money, type Currency } from '../../../domain/value-objects/money.vo';
import { InvalidAmountError } from '../../../domain/errors/invalid-amount.error';

export interface RecordIncomeInput {
  doctorId: string;
  amount: number;
  currency: Currency;
  description: string;
  relatedConsultationId?: string | null;
  date?: Date;
}

export interface RecordIncomeOutput {
  id: string;
  doctorId: string;
  type: 'income';
  amount: number;
  currency: Currency;
  description: string;
  relatedConsultationId: string | null;
  date: Date;
  createdAt: Date;
}

/**
 * Records a manual income entry for a doctor.
 *
 * Validation: amount > 0 is enforced by the Money value object constructor
 * (throws InvalidAmountError on violation).
 */
@Injectable()
export class RecordIncomeUseCase {
  constructor(
    @Inject(FINANCE_REPOSITORY)
    private readonly financeRepo: IFinanceRepository,
  ) {}

  async execute(input: RecordIncomeInput): Promise<RecordIncomeOutput> {
    if (input.amount <= 0) {
      throw new InvalidAmountError(input.amount);
    }
    const money = new Money(input.amount, input.currency);

    const transaction = FinancialTransaction.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      type: 'income',
      amount: money,
      description: input.description,
      relatedConsultationId: input.relatedConsultationId ?? null,
      date: input.date ?? new Date(),
      createdAt: new Date(),
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
      date: tx.date,
      createdAt: tx.createdAt,
    };
  }
}
