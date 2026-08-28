import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SELLER_COMMISSION_REPOSITORY,
  type ISellerCommissionRepository,
  type AccrueCommissionResult,
} from '../../domain/repositories/seller-commission.repository';

/**
 * Paid plans and their commission amounts.
 * TEXT values — no Postgres ENUM (see ADR note in the migration).
 */
const PAID_PLAN_COMMISSIONS: Readonly<Record<string, number>> = {
  delta_base: 10,
  delta_plus: 20,
} as const;

/**
 * AccruePlanCommissionUseCase
 *
 * Called (best-effort / fire-and-forget) whenever a specialist transitions to
 * a paid plan. Currently wired from:
 *
 *   1. ApproveSubscriptionPaymentUseCase — doctor self-service payment approved
 *      by admin (plan can change as part of the approval).
 *   2. UpdateDoctorSubscriptionUseCase — admin directly changes the subscription.
 *   3. ExtendDoctorSubscriptionUseCase — admin grants an extension, which can also
 *      migrate the doctor onto a paid plan.
 *
 * These three are ALL the paths that write profiles.plan. If a fourth appears, it
 * must be wired here too: a plan change with no accrual is silent lost money.
 *
 * Business rules:
 *   - Only for plans in PAID_PLAN_COMMISSIONS (delta_base, delta_plus).
 *   - The specialist must have a non-null sold_by.
 *   - The seller must be active at the time of the event.
 *   - Only the FIRST plan commission is generated (UNIQUE constraint).
 *   - This commission is generated regardless of sold_by_source (code OR admin).
 *
 * IMPORTANT: This use case returns an AccrueCommissionResult and does not throw
 * for expected business conditions. Callers use `.catch()` for infrastructure errors.
 *
 * SECURITY: Never log specialistId in a way that can be joined with PII.
 */
@Injectable()
export class AccruePlanCommissionUseCase {
  private readonly logger = new Logger(AccruePlanCommissionUseCase.name);

  constructor(
    @Inject(SELLER_COMMISSION_REPOSITORY)
    private readonly repo: ISellerCommissionRepository,
  ) {}

  async execute(specialistId: string, newPlanKey: string): Promise<AccrueCommissionResult> {
    // 1. Only care about paid plans
    const amountUsd = PAID_PLAN_COMMISSIONS[newPlanKey];
    if (amountUsd === undefined) {
      return 'skipped';
    }

    // 2. Load attribution info
    const profile = await this.repo.findSpecialistCommissionProfile(specialistId);

    if (!profile) {
      this.logger.warn(
        `[plan-commission] specialist not found — skipped specialistId=${specialistId}`,
      );
      return 'skipped';
    }

    // 3. No seller attributed → nothing to accrue
    if (!profile.soldBy) {
      return 'skipped';
    }

    // 4. Seller must be active at the moment of the event
    if (!profile.sellerIsActive) {
      this.logger.warn(
        `[plan-commission] seller is inactive — plan commission skipped for specialist`,
      );
      return 'skipped';
    }

    // 5. Insert commission (idempotent via UNIQUE constraint)
    const result = await this.repo.accrueCommission({
      sellerId: profile.soldBy,
      specialistId,
      type: 'plan',
      amountUsd,
      planKey: newPlanKey,
      earnedAt: new Date(),
    });

    if (result === 'created') {
      this.logger.log(
        `[plan-commission] created sellerId=${profile.soldBy} plan=${newPlanKey} amount=${amountUsd}`,
      );
    } else {
      this.logger.debug(`[plan-commission] already existed — no-op`);
    }

    return result;
  }
}
