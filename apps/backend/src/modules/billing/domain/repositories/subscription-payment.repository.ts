import type {
  SubscriptionPayment,
  SubscriptionPaymentStatus,
} from '../entities/subscription-payment.entity';

export const SUBSCRIPTION_PAYMENT_REPOSITORY = 'SUBSCRIPTION_PAYMENT_REPOSITORY';

export interface CreateSubscriptionPaymentParams {
  id: string;
  doctorId: string;
  amountUsd: number;
  method: string;
  referenceNumber: string | null;
  durationMonths: number;
}

export interface ApproveSubscriptionPaymentParams {
  paymentId: string;
  reviewerId: string;
  /** New subscription expiration after extending by durationMonths */
  newExpiresAt: Date;
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
   * Lists subscription payments with optional status filter (paginated).
   */
  list(filters: SubscriptionPaymentListFilters): Promise<SubscriptionPaymentListResult>;

  /**
   * Finds a subscription payment by id.
   * Returns null when not found.
   */
  findById(id: string): Promise<SubscriptionPayment | null>;

  /**
   * Persists a new subscription payment.
   */
  save(params: CreateSubscriptionPaymentParams): Promise<SubscriptionPayment>;

  /**
   * Approves a subscription payment AND extends the subscription in a single
   * transaction. Also inserts a subscription_changes_log entry.
   *
   * Steps (atomic):
   *   1. Mark payment approved (status, reviewed_by, reviewed_at)
   *   2. Update subscriptions.current_period_end = newExpiresAt
   *   3. Sync profiles snapshot (subscription_status='active', subscription_expires_at)
   *   4. Insert subscription_changes_log
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
   * Rejects a subscription payment (status, reviewed_by, reviewed_at).
   */
  reject(paymentId: string, reviewerId: string, reason?: string): Promise<void>;
}
