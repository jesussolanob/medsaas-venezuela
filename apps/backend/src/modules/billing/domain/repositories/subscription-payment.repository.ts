import type {
  SubscriptionPayment,
  SubscriptionPaymentStatus,
} from '../entities/subscription-payment.entity';

export const SUBSCRIPTION_PAYMENT_REPOSITORY = 'SUBSCRIPTION_PAYMENT_REPOSITORY';

// ---------------------------------------------------------------------------
// Finance stats types (admin aggregates — no patient PII)
// ---------------------------------------------------------------------------

/** One monthly bucket for the finance chart (last 6 months). */
export interface MonthBucket {
  /** Short Spanish month label, e.g. "Jun" */
  label: string;
  total: number;
}

/** A recently-approved payment row enriched with the doctor's name. */
export interface RecentApprovedRow {
  id: string;
  /** PII — doctor name. Admin-only context. */
  doctorName: string;
  amountUsd: number;
  method: string;
  reviewedAt: Date;
}

/** A pending payment row enriched with doctor identity for dashboard display. */
export interface PendingPaymentRow {
  id: string;
  /** PII — doctor name. Admin-only context. */
  doctorName: string;
  /** PII — doctor specialty. Admin-only context. */
  specialty: string | null;
  amountUsd: number;
  method: string;
  createdAt: Date;
}

/**
 * Aggregated finance stats derived from subscription_payments.
 *
 * SECURITY NOTE: doctorName / specialty are doctor-level PII (NOT patient PII).
 * This type is intentionally admin-only.
 */
export interface FinanceStats {
  mtdRevenue: number;
  prevMtdRevenue: number;
  momChange: number;
  pendingTotal: number;
  pendingCount: number;
  totalApproved: number;
  monthBuckets: MonthBucket[];
  recentApproved: RecentApprovedRow[];
  pendingPayments: PendingPaymentRow[];
}

export interface CreateSubscriptionPaymentParams {
  id: string;
  doctorId: string;
  amountUsd: number;
  method: string;
  referenceNumber: string | null;
  durationMonths: number;
}

/**
 * Parameters for creating a doctor self-service payment (pending, with comprobante).
 * Amount fields are always server-calculated — never trusted from the client.
 */
export interface CreateDoctorPaymentParams {
  id: string;
  doctorId: string;
  /** Server-calculated USD amount from plan_prices. */
  amountUsd: number;
  /** Server-calculated bolívar amount (amountUsd * bcvRate). */
  amountBs: number;
  /** BCV rate used for the conversion. */
  bcvRateUsed: number;
  method: string;
  referenceNumber: string;
  durationMonths: number;
  planKey: string;
  period: string;
  bankCode: string;
  /** GCS object path (NOT a signed URL). */
  receiptUrl: string;
  notes: string | null;
}

/**
 * Parameters for creating a manually-registered (already-approved) payment
 * and extending the subscription atomically.
 */
export interface SaveApprovedAndExtendParams {
  id: string;
  doctorId: string;
  amountUsd: number;
  method: string;
  referenceNumber: string | null;
  durationMonths: number;
  reviewerId: string;
  reviewedAt: Date;
  newExpiresAt: Date;
}

export interface ApproveSubscriptionPaymentParams {
  paymentId: string;
  reviewerId: string;
  /** New subscription expiration after extending by durationMonths */
  newExpiresAt: Date;
  /**
   * When set (doctor self-service payment with a specific planKey),
   * the approval ALSO changes the doctor's effective plan to this key.
   * Must be atomic within the same transaction.
   * When null/undefined, only the subscription period is extended (legacy behaviour).
   */
  newPlanKey?: string | null;
}

export interface SubscriptionPaymentListFilters {
  status?: SubscriptionPaymentStatus;
  page: number;
  limit: number;
}

export interface SubscriptionPaymentListResult {
  items: SubscriptionPayment[];
  total: number;
  page: number;
  limit: number;
}

export interface ISubscriptionPaymentRepository {
  /**
   * Lists subscription payments (admin — all doctors) with optional status filter (paginated).
   */
  list(filters: SubscriptionPaymentListFilters): Promise<SubscriptionPaymentListResult>;

  /**
   * Lists subscription payments for a specific doctor (scoped by doctorId — anti-IDOR).
   */
  listByDoctor(
    doctorId: string,
    page: number,
    limit: number,
  ): Promise<SubscriptionPaymentListResult>;

  /**
   * Aggregates finance KPIs from subscription_payments for the admin finance page.
   * Joins profiles for doctor name/specialty (doctor PII — admin-only).
   */
  getFinanceStats(): Promise<FinanceStats>;

  /**
   * Finds a subscription payment by id.
   * Returns null when not found.
   */
  findById(id: string): Promise<SubscriptionPayment | null>;

  /**
   * Finds the most recent pending payment for a doctor.
   * Used for anti-spam check: only one pending payment allowed at a time.
   * Returns null when no pending payment exists.
   */
  findPendingByDoctor(doctorId: string): Promise<SubscriptionPayment | null>;

  /**
   * Persists a new subscription payment (admin manual registration path).
   */
  save(params: CreateSubscriptionPaymentParams): Promise<SubscriptionPayment>;

  /**
   * Persists a new doctor self-service payment with status='pending'.
   * Amount fields are always server-calculated.
   */
  saveDoctorPayment(params: CreateDoctorPaymentParams): Promise<SubscriptionPayment>;

  /**
   * Approves a subscription payment AND extends (and optionally changes) the
   * subscription in a single transaction. Also inserts a subscription_changes_log entry.
   *
   * Steps (atomic):
   *   1. Mark payment approved (status, reviewed_by, reviewed_at)
   *   2. Update subscriptions.current_period_end = newExpiresAt
   *   3. If newPlanKey is set: change profiles.plan + subscriptions.plan
   *   4. Sync profiles snapshot (subscription_status='active', subscription_expires_at)
   *   5. Insert subscription_changes_log
   */
  approveAndExtend(
    params: ApproveSubscriptionPaymentParams,
    meta: {
      amountUsd: number;
      method: string;
      referenceNumber: string | null;
      monthsAdded: number;
      actorRole: string;
    },
  ): Promise<void>;

  /**
   * Creates a new subscription payment with status='approved' AND extends the
   * subscription in a single transaction. Also inserts a subscription_changes_log entry.
   *
   * Used for manual payments registered directly by a super_admin (e.g. cash / wire transfer).
   *
   * Steps (atomic):
   *   1. INSERT subscription_payment with status='approved'
   *   2. Update subscriptions.current_period_end = newExpiresAt
   *   3. Sync profiles snapshot (subscription_status='active', subscription_expires_at)
   *   4. INSERT subscription_changes_log
   *
   * Returns the persisted SubscriptionPayment domain entity.
   */
  saveApprovedAndExtend(params: SaveApprovedAndExtendParams): Promise<SubscriptionPayment>;

  /**
   * Rejects a subscription payment (status, reviewed_by, reviewed_at, rejection_reason).
   */
  reject(paymentId: string, reviewerId: string, reason?: string): Promise<void>;
}
