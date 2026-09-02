/**
 * ISellerCommissionRepository — domain contract for commission persistence.
 *
 * Implementations must never log PII (fullName, email, cedula, phone) of
 * any specialist or seller.
 */

import type { CommissionStatus, CommissionType } from '../entities/seller-commission.entity';
import type { SellerPayment } from '../entities/seller-payment.entity';

export const SELLER_COMMISSION_REPOSITORY = Symbol('ISellerCommissionRepository');

// ---------------------------------------------------------------------------
// Profile read models (used internally by commission logic)
// ---------------------------------------------------------------------------

/**
 * Minimal specialist profile data needed to determine commission eligibility.
 * Fetched from `profiles` + seller cross-join; no PII returned.
 */
export interface SpecialistCommissionProfile {
  specialistId: string;
  soldBy: string | null;
  /**
   * How the attribution happened: 'code' | 'seller_manual' | 'admin' | null.
   * Only the first two earn the signup commission — 'admin' is a lead the
   * super_admin assigned, which pays on the plan change only.
   */
  soldBySource: string | null;
  /** Whether the seller referenced by soldBy is currently active. */
  sellerIsActive: boolean;
}

// ---------------------------------------------------------------------------
// Commission accrual
// ---------------------------------------------------------------------------

export interface AccrueCommissionParams {
  sellerId: string;
  specialistId: string;
  type: CommissionType;
  amountUsd: number;
  /** Only for 'plan' type. */
  planKey: string | null;
  earnedAt: Date;
}

/** Result of an accrual attempt. */
export type AccrueCommissionResult = 'created' | 'duplicate' | 'skipped';

// ---------------------------------------------------------------------------
// Commission read models
// ---------------------------------------------------------------------------

export interface CommissionRow {
  id: string;
  sellerId: string;
  specialistId: string;
  /** Full name — PII. Never log. Only expose to the seller who owns the commission. */
  specialistName: string;
  type: CommissionType;
  amountUsd: number;
  planKey: string | null;
  status: CommissionStatus;
  earnedAt: Date;
  paymentId: string | null;
  createdAt: Date;
}

export interface PendingCommissionDetail {
  commissionId: string;
  specialistId: string;
  /** PII — never log. */
  specialistName: string;
  type: CommissionType;
  amountUsd: number;
  planKey: string | null;
  earnedAt: Date;
  /** 'pending' (sin revisar) o 'approved' (habilitada para pago). Nunca 'paid'. */
  status: CommissionStatus;
}

export interface PendingBySeller {
  sellerId: string;
  /** PII — never log. */
  sellerName: string;
  /**
   * Total de lo NO pagado (pendiente + aprobado). Es lo que se le debe al
   * vendedor; la aprobación no cambia la deuda, solo habilita el pago.
   */
  totalPendingUsd: number;
  pendingCount: number;
  /** Cuántas están aprobadas y por lo tanto se pueden pagar ahora. */
  approvedCount: number;
  /** Suma en USD de las aprobadas — el máximo que se puede pagar hoy. */
  totalApprovedUsd: number;
  commissions: PendingCommissionDetail[];
}

// ---------------------------------------------------------------------------
// Payment registration
// ---------------------------------------------------------------------------

export interface RegisterPaymentParams {
  sellerId: string;
  commissionIds: string[];
  method: string;
  reference: string;
  receiptUrl: string | null;
  notes: string | null;
  paidAt: Date;
  /**
   * BCV rate (Bs per USD) captured at the moment the payment is registered.
   * Null when the rate was unavailable — never blocks a payment from being created.
   */
  bcvRate: number | null;
}

// ---------------------------------------------------------------------------
// Seller assignment
// ---------------------------------------------------------------------------

export interface AssignSpecialistParams {
  specialistId: string;
  newSellerId: string;
  previousSellerId: string | null;
  assignedBy: string;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface ISellerCommissionRepository {
  /**
   * Looks up the minimal attribution data for a specialist needed to decide
   * whether a commission should be accrued.
   * Returns null if the specialist does not exist.
   * SECURITY: never log the returned data (contains PII-adjacent fields).
   */
  findSpecialistCommissionProfile(
    specialistId: string,
  ): Promise<SpecialistCommissionProfile | null>;

  /**
   * Inserts a new commission row. Returns:
   *   'created'   — commission was inserted.
   *   'duplicate' — UNIQUE(specialist_id, type) constraint already satisfied;
   *                 the commission was silently skipped (idempotent).
   *   'skipped'   — caller decided no commission is due (returned by use case,
   *                 not the repository, but typed here for completeness).
   *
   * The DB UNIQUE constraint makes this safe to call multiple times.
   */
  accrueCommission(params: AccrueCommissionParams): Promise<'created' | 'duplicate'>;

  /**
   * Returns all commissions for a seller, enriched with the specialist's name.
   * Ordered by earned_at DESC. Anti-IDOR: always filtered by sellerId.
   * SECURITY: specialistName is PII — only expose to the owning seller.
   */
  listCommissionsBySeller(sellerId: string): Promise<CommissionRow[]>;

  /**
   * Returns all unpaid commissions (pending + approved) grouped by seller.
   * Used by the admin panel to decide what to approve and who to pay next.
   * SECURITY: sellerName/specialistName are PII — admin-only endpoint.
   */
  listPendingBySeller(): Promise<PendingBySeller[]>;

  /**
   * Marks the given commissions as 'approved', stamping approved_at/approved_by.
   *
   * Only rows currently 'pending' and belonging to sellerId are touched — the
   * status filter lives in the UPDATE's WHERE clause so two concurrent approvals
   * can't double-apply. Returns how many rows actually changed.
   *
   * Throws InvalidCommissionIdsError if any id doesn't belong to the seller or
   * isn't pending (anti-IDOR + no re-approving something already paid).
   *
   * SECURITY: adminId must come from the authenticated session, never the body.
   */
  approveCommissions(sellerId: string, commissionIds: string[], adminId: string): Promise<number>;

  /**
   * Validates that all commissionIds belong to sellerId and are 'approved'.
   * Returns the matching rows.
   * Throws InvalidCommissionIdsError if any ID is invalid, still pending,
   * already paid, or belongs to another seller
   * (anti-IDOR + anti-double-payment + no skipping the approval step).
   */
  findCommissionsForPayment(sellerId: string, commissionIds: string[]): Promise<CommissionRow[]>;

  /**
   * Atomically creates a seller_payment and marks all commissionIds as 'paid'
   * with the new payment_id. The amount is calculated from the commissions,
   * never from the client.
   *
   * Transactional: if any step fails, nothing is committed.
   *
   * Callers must call findCommissionsForPayment first to validate ownership
   * and status before calling this method.
   */
  registerPayment(params: RegisterPaymentParams, adminId: string): Promise<SellerPayment>;

  /**
   * Returns all payments for a seller, ordered by paid_at DESC.
   * Anti-IDOR: always filtered by sellerId.
   */
  listPaymentsBySeller(sellerId: string): Promise<SellerPayment[]>;

  /**
   * Returns a single seller_payment by its primary key, or null if not found.
   *
   * No ownership check is applied here — the caller is responsible for
   * verifying that the returned payment belongs to the requesting seller
   * (anti-IDOR).  Admin callers may skip that check.
   *
   * SECURITY: receiptUrl (the GCS path) must never appear in logs.
   */
  findPaymentById(paymentId: string): Promise<SellerPayment | null>;

  /**
   * Checks whether a seller profile exists and is active.
   */
  findSellerById(sellerId: string): Promise<{ id: string; isActive: boolean } | null>;

  /**
   * Checks whether a specialist profile exists and returns attribution info.
   */
  findSpecialistById(specialistId: string): Promise<{ id: string; soldBy: string | null } | null>;

  /**
   * Admin-only: re-assigns a specialist to a different seller.
   *
   * Unlike the onboarding path (WHERE sold_by IS NULL), this deliberately
   * overwrites any existing sold_by — the admin can override the attribution.
   * Also writes sold_by_source = 'admin' and inserts a seller_attribution_log row.
   *
   * SECURITY: assignedBy must always come from the authenticated session (anti-IDOR).
   */
  assignSpecialistToSeller(params: AssignSpecialistParams): Promise<void>;
}
