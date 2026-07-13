import type { FinancialTransaction } from '../entities/financial-transaction.entity';

export const FINANCE_REPOSITORY = 'FINANCE_REPOSITORY';

export interface TransactionListFilters {
  doctorId: string;
  month?: string; // 'YYYY-MM'
  page: number;
  limit: number;
}

export interface IncomeTransactionItem {
  id: string;
  amount: number;
  currency: string;
  description: string;
  date: Date;
  conceptId: string | null;
  patientId: string | null;
  /** Decrypted patient name; null when there is no linked patient. */
  patientName: string | null;
}

export interface IncomeListFilters {
  doctorId: string;
  month?: string; // 'YYYY-MM'
  /** If present, only return income rows with this conceptId. */
  conceptId?: string | null;
  limit?: number;
}

/**
 * A single normalised income row returned by the unified UNION query.
 * Both `payments` and `financial_transactions (type='income')` are projected
 * to this shape before paging.
 */
export interface UnifiedIncomeItem {
  id: string;
  date: Date;
  amount_usd: number;
  source: 'consultation' | 'manual';
  /** 'pending' | 'approved' for consultation rows; null for manual rows. */
  status: 'pending' | 'approved' | null;
  /** Concept description for manual rows; null for consultation rows. */
  concept: string | null;
  patient_id: string | null;
  /**
   * Decrypted patient full name — owner-scoped (doctor_id matches both the
   * payment/transaction and the patients row). Null when no patient is linked
   * or when decryption fails. NEVER log this value (PII).
   */
  patient_name: string | null;
  /** Payment/consultation reference code; null for manual rows without one. */
  reference: string | null;
}

export interface UnifiedIncomeListFilters {
  doctorId: string;
  month?: string; // 'YYYY-MM'
  page: number;
  limit: number;
}

export interface UnifiedIncomeListResult {
  items: UnifiedIncomeItem[];
  total: number;
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
 * Income breakdown for the summary endpoint.
 * All values are in USD and always >= 0.
 */
export interface IncomeSummaryBreakdown {
  /** Sum of approved consultation amounts in the period. */
  consultationsApproved: number;
  /** Sum of pending consultation amounts in the period. */
  consultationsPending: number;
  /** Sum of manual income transactions in the period. */
  manualIncome: number;
}

/**
 * Expense breakdown by category for the summary endpoint.
 * Keys match the ExpenseConcept enum. Values are always >= 0.
 * Legacy/uncategorised expense rows are accumulated under 'other'.
 */
export interface ExpenseSummaryBreakdown {
  rent: number;
  staff: number;
  supplies: number;
  services: number;
  taxes: number;
  other: number;
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

  /**
   * Soft/hard-deletes a financial transaction by id.
   * SECURITY: doctorId enforces ownership — only the owning doctor can delete.
   * Only expense-type transactions can be deleted (income entries are read-only audit records).
   * Throws TransactionNotFoundError when id does not exist or does not belong to doctorId.
   */
  delete(id: string, doctorId: string): Promise<void>;

  /**
   * Persists an updated transaction (all editable fields replaced).
   * doctorId is included in the WHERE clause as a second ownership gate —
   * defense in depth even when the use-case has already verified ownership.
   */
  updateTransaction(
    transaction: FinancialTransaction,
    doctorId: string,
  ): Promise<FinancialTransaction>;

  /**
   * Returns the all-time total income for a doctor (approved consultations + manual income).
   * No date filtering applied.
   */
  lifetimeIncome(doctorId: string): Promise<{ total: number; consultationCount: number }>;

  /**
   * Returns income-type transactions with decrypted patientName.
   * Used for the finance chart on the doctor dashboard.
   * Patient names are decrypted within the doctor's own scope — never logged as PII.
   */
  listIncomeTransactions(filters: IncomeListFilters): Promise<IncomeTransactionItem[]>;

  /**
   * Unified paginated list of income from both sources:
   *   - `payments` table (consultation income, approved + pending)
   *   - `financial_transactions` WHERE type = 'income' (manual income)
   *
   * Results are ordered by date DESC and paginated via LIMIT/OFFSET.
   * The total COUNT spans the full UNION (not just one page).
   *
   * SECURITY: doctorId is always from the authenticated caller (anti-IDOR).
   * No patient PII (name, cedula, phone) is returned — only patient_id.
   */
  listIncomePaginated(filters: UnifiedIncomeListFilters): Promise<UnifiedIncomeListResult>;

  /**
   * Returns a granular income breakdown for the given doctor and month:
   *   - consultationsApproved: SUM of approved consultation amounts.
   *   - consultationsPending: SUM of pending consultation amounts (COALESCE plan_price).
   *   - manualIncome: SUM of manual income transactions.
   *
   * SECURITY: scoped to doctorId (anti-IDOR).
   */
  getIncomeBreakdown(doctorId: string, month: string): Promise<IncomeSummaryBreakdown>;

  /**
   * Returns expense totals grouped by expense_concept for the given doctor and month.
   * Rows with NULL expense_concept are accumulated under 'other'.
   *
   * SECURITY: scoped to doctorId (anti-IDOR).
   */
  getExpenseBreakdown(doctorId: string, month: string): Promise<ExpenseSummaryBreakdown>;
}
