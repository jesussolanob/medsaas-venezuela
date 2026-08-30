import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
} from '../../domain/repositories/seller.repository';
import { CannotDeactivateSellerRoleError } from '../../domain/errors/cannot-deactivate-seller-role.error';
import { SellerNotFoundError } from '../../domain/errors/seller-not-found.error';
import { GetSellerPendingSummaryUseCase } from '../../../seller-commissions/application/use-cases/get-seller-pending-summary.use-case';

export interface DeactivateSellerAccountInput {
  sellerId: string;
  /** Role of the caller, taken from the authenticated token — never the body. */
  role: string;
  reason?: string | null;
}

export interface DeactivateSellerAccountOutput {
  deactivated: true;
  /**
   * Total USD amount of commissions still in 'pending' status at the time of
   * deactivation. Zero when there is nothing outstanding.
   *
   * The frontend shows this figure in the confirmation dialog so the seller
   * knows they have money waiting before they confirm.
   *
   * SECURITY: financial data — never log this value.
   */
  pendingCommissionsUsd: number;
  /**
   * Number of individual commission rows in 'pending' status at the time of
   * deactivation. Zero when there are no pending rows.
   */
  pendingCommissionsCount: number;
}

/**
 * DeactivateSellerAccountUseCase — a seller switches their own account off
 * from their portal.
 *
 * This is a DEACTIVATION, never a deletion. Everything the seller produced
 * (attributed specialists, commissions, payments) stays exactly where it is
 * under the same profile id — all of it remains auditable and a super_admin
 * can reactivate the account with the existing toggle in /admin/sellers.
 *
 * KEY DIFFERENCE FROM THE SPECIALIST FLOW:
 *   Sellers are not blocked by pending items — they can always leave. What
 *   they must know is how much they still have pending so they can decide
 *   whether to wait for the payment. The response always carries that summary.
 *
 * CONSEQUENCES OF DEACTIVATION (ADR-046):
 *   - Pending commissions are still owed — nothing already earned is lost.
 *   - The seller's referral link stops attributing new specialists.
 *   - No new commissions accrue after deactivation.
 *
 * FLOW:
 *   1. Role must be 'seller' — defence in depth alongside RolesGuard.
 *   2. Profile must exist.
 *   3. Fetch the pending commission summary (informational, never blocking).
 *   4. Deactivate immediately: is_active = false, deactivated_by = 'self'.
 *   5. Return the pending summary so the frontend can surface it.
 *
 * Why it does not block on pending commissions:
 *   A specialist can be blocked because stranding future appointments harms
 *   third parties (patients). A seller leaving has no equivalent harm — Delta
 *   still owes what it owes and can pay it to an inactive account.
 *
 * SECURITY:
 *   - sellerId always comes from user.sub, never from the request body, so a
 *     caller can only ever deactivate themselves.
 *   - The reason is free text written by the account owner about their own
 *     account — no patient PII — and is never logged.
 */
@Injectable()
export class DeactivateSellerAccountUseCase {
  private readonly logger = new Logger(DeactivateSellerAccountUseCase.name);

  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
    private readonly getPendingSummary: GetSellerPendingSummaryUseCase,
  ) {}

  async execute(input: DeactivateSellerAccountInput): Promise<DeactivateSellerAccountOutput> {
    // 1. Sellers only — defence in depth alongside the RolesGuard that already
    //    gates the endpoint. Checked before any DB read (role comes from token).
    if (input.role !== 'seller') {
      throw new CannotDeactivateSellerRoleError();
    }

    // 2. Profile must exist.
    const profile = await this.sellerRepo.findById(input.sellerId);
    if (!profile) {
      throw new SellerNotFoundError();
    }

    // 3. Fetch the pending commission summary so we can tell the seller how
    //    much they have outstanding. This is informational only — it never
    //    blocks the deactivation. The logic for what counts as "pending" lives
    //    in GetSellerPendingSummaryUseCase (seller-commissions module), so a
    //    future status change there automatically applies here.
    const { pendingCommissionsUsd, pendingCommissionsCount } = await this.getPendingSummary.execute(
      input.sellerId,
    );

    // 4. Deactivate immediately. Unlike the specialist flow there are no days
    //    to respect — sellers do not have a subscription plan.
    const reason = normaliseReason(input.reason);
    await this.sellerRepo.deactivateOwnAccount(input.sellerId, reason);

    // Deliberate: the id is not PII and is the audit trail for a support
    // request that starts with "I can't get in to my seller account".
    this.logger.log(`[deactivation] self sellerId="${input.sellerId}"`);

    return {
      deactivated: true,
      pendingCommissionsUsd,
      pendingCommissionsCount,
    };
  }
}

/** Blank or whitespace-only reasons are stored as NULL, not as an empty string. */
function normaliseReason(reason: string | null | undefined): string | null {
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  return trimmed.length > 0 ? trimmed : null;
}
