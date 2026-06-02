import type { FinancialTransaction } from '../entities/financial-transaction.entity';

export const FINANCE_REPOSITORY = 'FINANCE_REPOSITORY';

export interface TransactionListFilters {
  doctorId: string;
  month?: string; // 'YYYY-MM'
  page: number;
  limit: number;
}

export interface TransactionListResult {
  items: FinancialTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface ConsultationSummary {
  /** Sum of amount for payment_status='approved' within the period. */
  approvedTotal: number;
  /** Count of approved consultations within the period. */
  approvedCount: number;
  /** Sum of amount for payment_status='pending' within the period. */
  pendingTotal: number;
}

/**
 * Contract for financial persistence.
 *
 * The application layer depends only on this interface — never on the
 * Sequelize implementation — to keep the domain layer infrastructure-free.
 */
export interface IFinanceRepository {
  /** Persist a new financial transaction. */
  save(transaction: FinancialTransaction): Promise<FinancialTransaction>;

  /** Find a transaction by ID scoped to doctorId. */
  findById(id: string, doctorId: string): Promise<FinancialTransaction | null>;

  /** Paginated list of transactions for a doctor, optionally filtered by month. */
  list(filters: TransactionListFilters): Promise<TransactionListResult>;

  /**
   * Aggregates financial data from the consultations table for a given doctor
   * and month period (YYYY-MM). Queries consultations.amount where
   * payment_status='approved' or 'pending'.
   */
  getConsultationSummary(doctorId: string, month: string): Promise<ConsultationSummary>;

  /**
   * Sums manual income transactions for the given doctor in the given month.
   * Returns { total, count }.
   */
  sumManualIncome(doctorId: string, month: string): Promise<{ total: number; count: number }>;

  /**
   * Sums expense transactions for the given doctor in the given month.
   * Returns { total, count }.
   */
  sumExpenses(doctorId: string, month: string): Promise<{ total: number; count: number }>;
}
