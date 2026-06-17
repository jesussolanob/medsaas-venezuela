import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, type WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { FinancialTransaction } from '../../../domain/entities/financial-transaction.entity';
import { Money } from '../../../domain/value-objects/money.vo';
import type {
  IFinanceRepository,
  TransactionListFilters,
  TransactionListResult,
  ConsultationSummary,
} from '../../../domain/repositories/finance.repository';
import { FinancialTransactionModel } from '../models/financial-transaction.model';
import { TransactionNotFoundError } from '../../../domain/errors/transaction-not-found.error';
import { ForbiddenDomainError } from '../../../domain/errors/forbidden-domain.error';

/** Raw row returned by the consultation aggregation query. */
interface ConsultationAggRow {
  approved_total: string | null;
  approved_count: string | null;
  pending_total: string | null;
}

/** Raw row returned by the income/expense aggregation query. */
interface SumAggRow {
  total: string | null;
  count: string | null;
}

/**
 * Sequelize implementation of IFinanceRepository.
 *
 * Consultation aggregation is queried via raw SQL against the `consultations`
 * table so we don't need a full ConsultationModel dependency here.
 *
 * All month filtering uses the pattern: transaction_date (or consultation_date)
 * falls within [start of month, start of next month).
 */
@Injectable()
export class SequelizeFinanceRepository implements IFinanceRepository {
  constructor(
    @InjectModel(FinancialTransactionModel)
    private readonly txModel: typeof FinancialTransactionModel,
    private readonly sequelize: Sequelize,
  ) {}

  async save(transaction: FinancialTransaction): Promise<FinancialTransaction> {
    const row = await this.txModel.create({
      id: transaction.id,
      doctorId: transaction.doctorId,
      type: transaction.type,
      amount: transaction.amount.amount,
      currency: transaction.amount.currency,
      description: transaction.description,
      relatedConsultationId: transaction.relatedConsultationId,
      transactionDate: transaction.date,
      conceptId: transaction.conceptId ?? null,
    });
    return this.toDomain(row);
  }

  async findById(id: string, doctorId: string): Promise<FinancialTransaction | null> {
    const row = await this.txModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async list(filters: TransactionListFilters): Promise<TransactionListResult> {
    const where: Record<string, unknown> = { doctorId: filters.doctorId };

    if (filters.month) {
      const { start, end } = this.monthBounds(filters.month);
      where.transactionDate = { [Op.gte]: start, [Op.lt]: end };
    }

    const offset = (filters.page - 1) * filters.limit;
    const { count, rows } = await this.txModel.findAndCountAll({
      where: where as WhereOptions,
      limit: filters.limit,
      offset,
      order: [['transactionDate', 'DESC']],
    });

    return {
      items: rows.map((r) => this.toDomain(r)),
      total: count as number,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async getConsultationSummary(doctorId: string, month: string): Promise<ConsultationSummary> {
    const { start, end } = this.monthBounds(month);

    // COUNT returns bigint in Postgres; node-postgres delivers bigint as a string.
    // The ::text cast keeps the wire type consistent with the SumAggRow pattern
    // and avoids potential precision loss through JavaScript's number type.
    const rows = await this.sequelize.query<ConsultationAggRow>(
      `SELECT
         COALESCE(SUM(CASE WHEN payment_status = 'approved' THEN amount ELSE 0 END), 0) AS approved_total,
         COUNT(CASE WHEN payment_status = 'approved' THEN 1 ELSE NULL END)::text         AS approved_count,
         COALESCE(SUM(CASE WHEN payment_status = 'pending'  THEN amount ELSE 0 END), 0) AS pending_total
       FROM consultations
       WHERE doctor_id = :doctorId
         AND consultation_date >= :start
         AND consultation_date <  :end`,
      {
        replacements: { doctorId, start: start.toISOString(), end: end.toISOString() },
        type: QueryTypes.SELECT,
      },
    );

    const row = rows[0];

    return {
      approvedTotal: row ? parseFloat(row.approved_total ?? '0') : 0,
      approvedCount: row ? parseInt(row.approved_count ?? '0', 10) : 0,
      pendingTotal: row ? parseFloat(row.pending_total ?? '0') : 0,
    };
  }

  async sumManualIncome(
    doctorId: string,
    month: string,
  ): Promise<{ total: number; count: number }> {
    return this.sumByType(doctorId, month, 'income');
  }

  async sumExpenses(doctorId: string, month: string): Promise<{ total: number; count: number }> {
    return this.sumByType(doctorId, month, 'expense');
  }

  async updateTransaction(
    transaction: FinancialTransaction,
    doctorId: string,
  ): Promise<FinancialTransaction> {
    await this.txModel.update(
      {
        amount: transaction.amount.amount,
        currency: transaction.amount.currency,
        description: transaction.description,
        transactionDate: transaction.date,
        conceptId: transaction.conceptId,
      },
      // doctorId in WHERE is a second ownership gate (defense in depth).
      { where: { id: transaction.id, doctorId } as WhereOptions },
    );
    const updated = await this.txModel.findByPk(transaction.id);
    // The record was just updated — it cannot be missing at this point.
    return this.toDomain(updated!);
  }

  async delete(id: string, doctorId: string): Promise<void> {
    const row = await this.txModel.findOne({
      where: { id } as WhereOptions,
    });

    if (!row) throw new TransactionNotFoundError();
    if (row.doctorId !== doctorId)
      throw new ForbiddenDomainError('Transaction does not belong to this doctor');

    await this.txModel.destroy({
      where: { id } as WhereOptions,
    });
  }

  async lifetimeIncome(doctorId: string): Promise<{ total: number; consultationCount: number }> {
    // Sum approved consultations (all time) and manual income (all time) in parallel.
    const [consultationRows, incomeRows] = await Promise.all([
      this.sequelize.query<{ approved_total: string | null; approved_count: string | null }>(
        `SELECT
           COALESCE(SUM(amount), 0) AS approved_total,
           COUNT(*)::text           AS approved_count
         FROM consultations
         WHERE doctor_id       = :doctorId
           AND payment_status  = 'approved'`,
        {
          replacements: { doctorId },
          type: QueryTypes.SELECT,
        },
      ),
      this.sequelize.query<{ total: string | null }>(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM financial_transactions
         WHERE doctor_id = :doctorId
           AND type      = 'income'`,
        {
          replacements: { doctorId },
          type: QueryTypes.SELECT,
        },
      ),
    ]);

    const consultationRow = consultationRows[0];
    const incomeRow = incomeRows[0];

    const consultationTotal = consultationRow
      ? parseFloat(consultationRow.approved_total ?? '0')
      : 0;
    const consultationCount = consultationRow
      ? parseInt(consultationRow.approved_count ?? '0', 10)
      : 0;
    const manualIncome = incomeRow ? parseFloat(incomeRow.total ?? '0') : 0;

    return {
      total: parseFloat((consultationTotal + manualIncome).toFixed(2)),
      consultationCount,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async sumByType(
    doctorId: string,
    month: string,
    type: string,
  ): Promise<{ total: number; count: number }> {
    const { start, end } = this.monthBounds(month);

    // COUNT(*)::text — same bigint-as-string rationale as getConsultationSummary.
    const rows = await this.sequelize.query<SumAggRow>(
      `SELECT
         COALESCE(SUM(amount), 0) AS total,
         COUNT(*)::text           AS count
       FROM financial_transactions
       WHERE doctor_id      = :doctorId
         AND type           = :type
         AND transaction_date >= :start
         AND transaction_date <  :end`,
      {
        replacements: { doctorId, type, start: start.toISOString(), end: end.toISOString() },
        type: QueryTypes.SELECT,
      },
    );

    const row = rows[0];
    return {
      total: row ? parseFloat(row.total ?? '0') : 0,
      count: row ? parseInt(row.count ?? '0', 10) : 0,
    };
  }

  private monthBounds(month: string): { start: Date; end: Date } {
    const parts = month.split('-');
    const year = parseInt(parts[0] ?? '', 10);
    const monthNum = parseInt(parts[1] ?? '', 10);

    // Fail loudly if the month string is malformed. Upstream validation (Zod regex
    // /^\d{4}-\d{2}$/ in the controller) should prevent this, but an explicit guard
    // here ensures that any bypass produces a clear error rather than silently
    // querying January 2026 (which was the old fallback behaviour).
    if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      throw new Error(`Invalid month format: "${month}" — expected YYYY-MM`);
    }

    const start = new Date(Date.UTC(year, monthNum - 1, 1));
    const end = new Date(Date.UTC(year, monthNum, 1));
    return { start, end };
  }

  private toDomain(row: FinancialTransactionModel): FinancialTransaction {
    const currency = row.currency as 'USD' | 'BS';
    return FinancialTransaction.create({
      id: row.id,
      doctorId: row.doctorId,
      type: row.type as 'income' | 'expense',
      amount: new Money(Number(row.amount), currency),
      description: row.description ?? '',
      relatedConsultationId: row.relatedConsultationId,
      date: row.transactionDate,
      createdAt: row.createdAt,
      conceptId: row.conceptId ?? null,
    });
  }
}
