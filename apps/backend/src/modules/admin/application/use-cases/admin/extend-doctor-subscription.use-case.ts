import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { SubscriptionPlan } from '@delta/shared-types';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../../domain/repositories/admin.repository';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import { AccruePlanCommissionUseCase } from '../../../../seller-commissions/application/use-cases/accrue-plan-commission.use-case';
import { reportCommissionFailure } from '../../../../seller-commissions/application/report-commission-failure';

export interface ExtendDoctorSubscriptionInput {
  doctorId: string;
  months?: number;
  days?: number;
  actorId: string;
  reason?: string | null;
}

export interface ExtendDoctorSubscriptionOutput {
  newExpiresAt: Date;
}

/**
 * Adds `months` to `date` without overflowing into the following month.
 *
 * JS `Date.setMonth` overflows when the source day doesn't exist in the
 * target month: e.g. Jan 31 + 1 month → March 3 instead of Feb 28.
 * Fix: set the day to 1 before shifting the month, then clamp back to
 * min(original_day, last_day_of_target_month).
 */
function addMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date);
  const originalDay = result.getDate();
  // Reset to day 1 to avoid overflow while changing the month
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  // Last day of the resulting month (day 0 of the next month)
  const lastDayOfMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDayOfMonth));
  return result;
}

/**
 * Manually extends a doctor's subscription by N days or months (admin grant).
 *
 * Stripe-style anchor: if the current expiry is in the future, extend from it;
 * otherwise extend from now. Sets status 'active' and migrates a 'trial' plan to
 * 'basic' (the single paid plan), mirroring the legacy lib/subscription.ts.
 */
@Injectable()
export class ExtendDoctorSubscriptionUseCase {
  private readonly logger = new Logger(ExtendDoctorSubscriptionUseCase.name);

  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly repo: IAdminRepository,
    @Optional()
    private readonly accruePlanCommission: AccruePlanCommissionUseCase | null = null,
  ) {}

  async execute(input: ExtendDoctorSubscriptionInput): Promise<ExtendDoctorSubscriptionOutput> {
    const snapshot = await this.repo.getSubscriptionSnapshot(input.doctorId);
    if (!snapshot) {
      throw new DoctorNotFoundError(input.doctorId);
    }

    const now = new Date();
    const currentEnd = snapshot.expiresAt;
    const anchor = currentEnd && currentEnd > now ? currentEnd : now;

    let newExpiresAt: Date;
    if (input.days !== undefined) {
      newExpiresAt = new Date(anchor);
      newExpiresAt.setDate(newExpiresAt.getDate() + input.days);
    } else {
      // months is guaranteed by the DTO refine (exactly one of days/months)
      newExpiresAt = addMonthsClamped(anchor, input.months!);
    }

    const newPlan: SubscriptionPlan =
      snapshot.plan === 'trial' ? 'basic' : (snapshot.plan ?? 'basic');

    const metadata =
      input.days !== undefined ? { days_added: input.days } : { months_added: input.months! };

    await this.repo.applyManualSubscriptionChange({
      doctorId: input.doctorId,
      action: 'manual_grant',
      actorId: input.actorId,
      actorRole: 'super_admin',
      reason: input.reason ?? null,
      newStatus: 'active',
      newExpiresAt,
      newPlan,
      metadata,
    });

    // Best-effort: this path can also land a specialist on a paid plan, so it has to
    // accrue like the other two. Idempotent — the UNIQUE(specialist_id, type) drops
    // repeats when the doctor was already on that plan.
    // CAVEAT: the legacy 'trial' → 'basic' migration above writes a legacy plan key,
    // and the commission engine only recognises delta_base / delta_plus, so that
    // particular transition accrues nothing. Deliberate: assigning an amount to the
    // legacy keys is the owner's call, not a guess to be made here.
    if (this.accruePlanCommission) {
      void this.accruePlanCommission.execute(input.doctorId, newPlan).catch((err: unknown) => {
        reportCommissionFailure(
          this.logger,
          {
            hook: 'extend-subscription',
            specialistId: input.doctorId,
            type: 'plan',
            planKey: newPlan,
          },
          err,
        );
      });
    }

    return { newExpiresAt };
  }
}
