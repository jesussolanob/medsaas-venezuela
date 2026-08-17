import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, type WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  FinancialTransaction,
  type ExpenseConcept,
} from '../../../domain/entities/financial-transaction.entity';
import { Money } from '../../../domain/value-objects/money.vo';
import type {
  IFinanceRepository,
  TransactionListFilters,
  TransactionListResult,
  ConsultationSummary,
  IncomeListFilters,
  IncomeTransactionItem,
  UnifiedIncomeItem,
  UnifiedIncomeListFilters,
  UnifiedIncomeListResult,
  IncomeSummaryBreakdown,
  ExpenseSummaryBreakdown,
} from '../../../domain/repositories/finance.repository';
import { FinancialTransactionModel } from '../models/financial-transaction.model';
import { TransactionNotFoundError } from '../../../domain/errors/transaction-not-found.error';
import { ForbiddenDomainError } from '../../../domain/errors/forbidden-domain.error';
import { InvalidMonthFormatError } from '../../../domain/errors/invalid-month-format.error';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';
import { INCOME_TX_DEFAULT_LIMIT } from '../../../application/constants/income-transactions.constants';

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

/** Raw row returned by the unified income UNION query. */
interface UnifiedIncomeRow {
  id: string;
  date: Date;
  amount_usd: string;
  source: string;
  status: string | null;
  concept: string | null;
  patient_id: string | null;
  /** AES-256-GCM ciphertext of the patient full name; null when no patient. */
  patient_full_name_enc: string | null;
  reference: string | null;
}

/** Raw row returned by the unified income COUNT query. */
/**
 * Una consulta cuenta como COBRADA cuando su cita está en un estado RESUELTO
 * (confirmada, atendida o no-asistió) o cuando no tiene cita asociada (ingreso
 * suelto, consulta cargada a mano).
 *
 * 'no_show' se incluye porque es un estado terminal: la cita ya ocurrió (aunque
 * el paciente no fue), no hay nada pendiente de confirmación.  Si el pago estaba
 * aprobado, es un ingreso cobrado (el portal no emite devoluciones).  Si el monto
 * quedó en 0 tras la inasistencia, la consulta no suma nada en ningún lado y el
 * filtro `COALESCE(c.amount, a.plan_price, 0) > 0` la excluye del listado de
 * cobros antes de que COBRADA entre en juego.
 *
 * Se usa como fragmento SQL sobre el alias `a` (appointments) — no lleva valores
 * del usuario, así que no hay riesgo de inyección.
 */
const COBRADA = "(a.id IS NULL OR a.status IN ('confirmed', 'completed', 'no_show'))";

interface CountRow {
  total: string;
}

/** Raw row for the listIncomeTransactions join query. */
interface IncomeWithPatientRow {
  id: string;
  amount: string;
  currency: string;
  description: string | null;
  transaction_date: Date;
  concept_id: string | null;
  patient_id: string | null;
  /** AES-256-GCM ciphertext of the patient name; null when patient_id is null. */
  patient_full_name: string | null;
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
    private readonly crypto: CryptoService,
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
      patientId: transaction.patientId ?? null,
      expenseConcept: transaction.expenseConcept ?? null,
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
    // LEFT JOIN appointments so that consultations without an explicit amount can
    // fall back to the appointment's plan_price (covers legacy rows and new bookings
    // where the amount is propagated from the appointment at create-time).
    // COALESCE(c.amount, a.plan_price, 0) is used for pending_total only; approved_total
    // still uses c.amount because approved consultations should have an explicit amount.
    // COBRADO = pago aprobado Y cita confirmada (o consulta sin cita). Una consulta
    // pagada cuya cita sigue "por confirmar" NO es ingreso todavía: se cuenta en
    // "Por ingresar" junto con las impagas, para que la plata no desaparezca de
    // ningún lado mientras espera confirmación.
    const rows = await this.sequelize.query<ConsultationAggRow>(
      `SELECT
         COALESCE(SUM(CASE WHEN c.payment_status = 'approved' AND ${COBRADA} THEN c.amount ELSE 0 END), 0)             AS approved_total,
         COUNT(CASE WHEN c.payment_status = 'approved' AND ${COBRADA} THEN 1 ELSE NULL END)::text                      AS approved_count,
         COALESCE(SUM(CASE WHEN c.payment_status = 'pending' OR NOT ${COBRADA} THEN COALESCE(c.amount, a.plan_price, 0) ELSE 0 END), 0) AS pending_total
       FROM consultations c
       LEFT JOIN appointments a ON a.id = c.appointment_id
       WHERE c.doctor_id = :doctorId
         AND c.consultation_date >= :start
         AND c.consultation_date <  :end`,
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
        patientId: transaction.patientId,
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

  async listIncomeTransactions(filters: IncomeListFilters): Promise<IncomeTransactionItem[]> {
    const { start, end } = filters.month
      ? this.monthBounds(filters.month)
      : { start: null, end: null };

    const limit = filters.limit ?? INCOME_TX_DEFAULT_LIMIT;

    // Build WHERE clauses dynamically to avoid SQL injection via raw params.
    const conditions: string[] = ['ft.doctor_id = :doctorId', "ft.type = 'income'"];
    const replacements: Record<string, unknown> = { doctorId: filters.doctorId, limit };

    if (start && end) {
      conditions.push('ft.transaction_date >= :start AND ft.transaction_date < :end');
      replacements.start = start.toISOString();
      replacements.end = end.toISOString();
    }

    if (filters.conceptId !== undefined) {
      if (filters.conceptId === null) {
        conditions.push('ft.concept_id IS NULL');
      } else {
        conditions.push('ft.concept_id = :conceptId');
        replacements.conceptId = filters.conceptId;
      }
    }

    const whereClause = conditions.join(' AND ');

    /**
     * LEFT JOIN patients so that income rows without a patient still appear.
     * We only select patients.full_name (ciphertext) — decrypted in the app layer.
     *
     * SECURITY — defense in depth on the JOIN:
     *   - `p.doctor_id = ft.doctor_id` ensures we never surface a patient row
     *     belonging to a different doctor, even if a patient_id FK was written
     *     incorrectly in the DB.
     *   - `p.deleted_at IS NULL` excludes soft-deleted patients.
     *
     * No PII is logged here.
     */
    const rows = await this.sequelize.query<IncomeWithPatientRow>(
      `SELECT
         ft.id,
         ft.amount,
         ft.currency,
         ft.description,
         ft.transaction_date,
         ft.concept_id,
         ft.patient_id,
         p.full_name AS patient_full_name
       FROM financial_transactions ft
       LEFT JOIN patients p
         ON p.id        = ft.patient_id
        AND p.doctor_id = ft.doctor_id
        AND p.deleted_at IS NULL
       WHERE ${whereClause}
       ORDER BY ft.transaction_date DESC
       LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT },
    );

    return rows.map((row) => {
      // Fix 1: DecryptionError isolation — a corrupted ciphertext on one row
      // must not propagate as a 500 for the entire list. Degrade gracefully to
      // patientName = null and log only the transaction id (never the ciphertext).
      let patientName: string | null = null;
      if (row.patient_full_name) {
        try {
          patientName = this.crypto.decrypt(row.patient_full_name);
        } catch {
          // Log tx id only — no PII in logs.
          // Logger is intentionally not injected here to avoid circular deps;
          // use console.warn which is filtered by the global log pipeline in prod.
          // eslint-disable-next-line no-console
          console.warn(`[FinanceRepo] Failed to decrypt patient name for tx ${row.id}`);
        }
      }

      return {
        id: row.id,
        amount: parseFloat(row.amount),
        currency: row.currency,
        description: row.description ?? '',
        date: row.transaction_date,
        conceptId: row.concept_id,
        patientId: row.patient_id,
        patientName,
      };
    });
  }

  async listIncomePaginated(filters: UnifiedIncomeListFilters): Promise<UnifiedIncomeListResult> {
    const replacements: Record<string, unknown> = { doctorId: filters.doctorId };

    // Build optional month WHERE clauses applied to both branches of the UNION.
    let monthWhereConsult = '';
    let monthWhereTx = '';

    if (filters.month) {
      const { start, end } = this.monthBounds(filters.month);
      replacements.start = start.toISOString();
      replacements.end = end.toISOString();
      // payments uses paid_at for approved rows and created_at as fallback
      monthWhereConsult =
        'AND COALESCE(p.paid_at, p.created_at) >= :start AND COALESCE(p.paid_at, p.created_at) < :end';
      monthWhereTx = 'AND ft.transaction_date >= :start AND ft.transaction_date < :end';
    }

    /**
     * UNION ALL of two income sources:
     *  1) payments — consultation income, SOLO las aprobadas
     *  2) financial_transactions (type='income') — manual income entries
     *
     * INGRESOS = PLATA COBRADA. Antes esta lista traía también los pagos
     * `pending`, así que una consulta impaga engrosaba el total de "Ingresos"
     * como si ya se hubiera cobrado. Lo pendiente se ve en Cobros y en el
     * "Por ingresar" del resumen (getFinancialSummary.pendingTotal), que es
     * justamente el lugar donde corresponde.
     *
     * Both branches project to the same 9 columns so the outer query can
     * ORDER BY date DESC and apply LIMIT/OFFSET uniformly.
     *
     * SECURITY:
     *  - doctor_id filter on both branches enforces ownership (anti-IDOR).
     *  - LEFT JOIN patients uses `pt.doctor_id = :doctorId` as a second gate
     *    (defense-in-depth): prevents surfacing a patient row belonging to a
     *    different doctor even if a patient_id FK was written incorrectly.
     *  - `pt.deleted_at IS NULL` excludes soft-deleted patients.
     *  - patient_full_name_enc is AES-256-GCM ciphertext — decrypted below,
     *    never logged (PII).
     */
    const unionSql = `
      SELECT
        p.id::text                          AS id,
        COALESCE(p.paid_at, p.created_at)  AS date,
        p.amount_usd::text                  AS amount_usd,
        'consultation'                      AS source,
        p.status::text                      AS status,
        NULL::text                          AS concept,
        p.patient_id::text                  AS patient_id,
        pt.full_name                        AS patient_full_name_enc,
        p.payment_code                      AS reference
      FROM payments p
      LEFT JOIN patients pt
        ON  pt.id         = p.patient_id
        AND pt.doctor_id  = :doctorId
        AND pt.deleted_at IS NULL
      WHERE p.doctor_id = :doctorId
        AND p.status = 'approved'
        -- Un pago de $0 no es un ingreso: aparece cuando una inasistencia sin
        -- multa deja el cobro en cero (ADR-031). Sin este filtro la lista de
        -- Ingresos mostraba una fila de $0 por cada no-show perdonado — plata
        -- que nadie pagó, listada como si se hubiera cobrado. El total no
        -- cambiaba (suma cero), pero la lista mentía.
        AND p.amount_usd > 0
        -- La cita tiene que estar en estado resuelto: un pago aprobado cuya
        -- cita sigue "por confirmar" todavía no es ingreso. 'no_show' se
        -- incluye porque es un estado terminal; si el pago está aprobado ya
        -- es un ingreso (el portal no emite devoluciones).
        -- EXISTS y no JOIN: un mismo pago puede cubrir varias citas (combo)
        -- y un JOIN duplicaría la fila del ingreso tantas veces como citas.
        AND (
          NOT EXISTS (SELECT 1 FROM appointments ap WHERE ap.payment_id = p.id)
          OR EXISTS (
            SELECT 1 FROM appointments ap
             WHERE ap.payment_id = p.id
               AND ap.status IN ('confirmed', 'completed', 'no_show')
          )
        )
        ${monthWhereConsult}

      UNION ALL

      SELECT
        ft.id::text                         AS id,
        ft.transaction_date                 AS date,
        ft.amount::text                     AS amount_usd,
        'manual'                            AS source,
        NULL::text                          AS status,
        ft.description                      AS concept,
        ft.patient_id::text                 AS patient_id,
        pt2.full_name                       AS patient_full_name_enc,
        NULL::text                          AS reference
      FROM financial_transactions ft
      LEFT JOIN patients pt2
        ON  pt2.id        = ft.patient_id
        AND pt2.doctor_id = :doctorId
        AND pt2.deleted_at IS NULL
      WHERE ft.doctor_id = :doctorId
        AND ft.type = 'income'
        ${monthWhereTx}
    `;

    // Run COUNT and paginated SELECT in parallel.
    const offset = (filters.page - 1) * filters.limit;
    replacements.limit = filters.limit;
    replacements.offset = offset;

    const [countRows, rows] = await Promise.all([
      this.sequelize.query<CountRow>(`SELECT COUNT(*) AS total FROM (${unionSql}) sub`, {
        replacements,
        type: QueryTypes.SELECT,
      }),
      this.sequelize.query<UnifiedIncomeRow>(
        `SELECT * FROM (${unionSql}) sub ORDER BY date DESC LIMIT :limit OFFSET :offset`,
        { replacements, type: QueryTypes.SELECT },
      ),
    ]);

    const total = countRows[0] ? parseInt(countRows[0].total, 10) : 0;

    const items: UnifiedIncomeItem[] = rows.map((r) => {
      // Decrypt patient name owner-scoped — graceful degradation on failure.
      // NEVER log the plaintext name or the ciphertext (PII).
      let patientName: string | null = null;
      if (r.patient_full_name_enc) {
        try {
          patientName = this.crypto.decrypt(r.patient_full_name_enc);
        } catch {
          // Log the row id only — no PII.
          // eslint-disable-next-line no-console
          console.warn(`[FinanceRepo] Failed to decrypt patient name for income row ${r.id}`);
        }
      }

      return {
        id: r.id,
        date: r.date instanceof Date ? r.date : new Date(r.date),
        amount_usd: parseFloat(r.amount_usd),
        source: r.source as 'consultation' | 'manual',
        status: (r.status as 'pending' | 'approved' | null) ?? null,
        concept: r.concept,
        patient_id: r.patient_id,
        patient_name: patientName,
        reference: r.reference,
      };
    });

    return { items, total, page: filters.page, limit: filters.limit };
  }

  /**
   * Granular income breakdown for the summary endpoint.
   *
   * Queries consultations (approved + pending) and financial_transactions
   * (type='income') separately, then returns three named totals:
   *   consultationsApproved, consultationsPending, manualIncome.
   *
   * This mirrors the logic in getConsultationSummary + sumManualIncome but
   * returns the three buckets together in one interface.
   *
   * SECURITY: doctorId in every WHERE clause — anti-IDOR.
   */
  async getIncomeBreakdown(doctorId: string, month: string): Promise<IncomeSummaryBreakdown> {
    const { start, end } = this.monthBounds(month);

    const [consultationRows, incomeRows] = await Promise.all([
      this.sequelize.query<{
        approved_total: string | null;
        pending_total: string | null;
      }>(
        // approved_total usa COBRADA igual que getConsultationSummary para que
        // ambas fuentes muestren el mismo número de "ingresos de consultas" en
        // la UI (evita que dos tarjetas de la misma pantalla se contradigan).
        `SELECT
           COALESCE(SUM(CASE WHEN c.payment_status = 'approved' AND ${COBRADA} THEN c.amount ELSE 0 END), 0) AS approved_total,
           COALESCE(SUM(CASE WHEN c.payment_status = 'pending'  THEN COALESCE(c.amount, a.plan_price, 0) ELSE 0 END), 0) AS pending_total
         FROM consultations c
         LEFT JOIN appointments a ON a.id = c.appointment_id
         WHERE c.doctor_id = :doctorId
           AND c.consultation_date >= :start
           AND c.consultation_date <  :end`,
        {
          replacements: { doctorId, start: start.toISOString(), end: end.toISOString() },
          type: QueryTypes.SELECT,
        },
      ),
      this.sequelize.query<{ total: string | null }>(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM financial_transactions
         WHERE doctor_id = :doctorId
           AND type = 'income'
           AND transaction_date >= :start
           AND transaction_date <  :end`,
        {
          replacements: { doctorId, start: start.toISOString(), end: end.toISOString() },
          type: QueryTypes.SELECT,
        },
      ),
    ]);

    const cRow = consultationRows[0];
    const iRow = incomeRows[0];

    return {
      consultationsApproved: cRow ? parseFloat(cRow.approved_total ?? '0') : 0,
      consultationsPending: cRow ? parseFloat(cRow.pending_total ?? '0') : 0,
      manualIncome: iRow ? parseFloat(iRow.total ?? '0') : 0,
    };
  }

  /**
   * Expense breakdown by expense_concept for the summary endpoint.
   *
   * Groups expense rows by COALESCE(expense_concept, 'other') so that legacy
   * rows (NULL concept) and rows explicitly categorised as 'other' are merged.
   *
   * Returns a flat object with all six keys always present (zero-filled for
   * absent categories) so the caller does not need to handle missing keys.
   *
   * SECURITY: doctorId in WHERE clause — anti-IDOR.
   */
  async getExpenseBreakdown(doctorId: string, month: string): Promise<ExpenseSummaryBreakdown> {
    const { start, end } = this.monthBounds(month);

    const rows = await this.sequelize.query<{ concept: string; total: string }>(
      `SELECT
         COALESCE(expense_concept, 'other') AS concept,
         COALESCE(SUM(amount), 0)::text     AS total
       FROM financial_transactions
       WHERE doctor_id = :doctorId
         AND type = 'expense'
         AND transaction_date >= :start
         AND transaction_date <  :end
       GROUP BY COALESCE(expense_concept, 'other')`,
      {
        replacements: { doctorId, start: start.toISOString(), end: end.toISOString() },
        type: QueryTypes.SELECT,
      },
    );

    // Initialise all six categories at zero, then fill from query results.
    const breakdown: ExpenseSummaryBreakdown = {
      rent: 0,
      staff: 0,
      supplies: 0,
      services: 0,
      taxes: 0,
      other: 0,
    };

    for (const row of rows) {
      const key = row.concept as keyof ExpenseSummaryBreakdown;
      if (Object.prototype.hasOwnProperty.call(breakdown, key)) {
        breakdown[key] = parseFloat(row.total);
      }
    }

    return breakdown;
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
      throw new InvalidMonthFormatError();
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
      patientId: row.patientId ?? null,
      expenseConcept: (row.expenseConcept as ExpenseConcept | null) ?? null,
    });
  }
}
