import { Inject, Injectable } from '@nestjs/common';
import type { SubscriptionPlan } from '@delta/shared-types';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../../domain/repositories/admin.repository';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';

export interface ExtendDoctorSubscriptionInput {
  doctorId: string;
  months: number;
  actorId: string;
  reason?: string | null;
}

export interface ExtendDoctorSubscriptionOutput {
  newExpiresAt: Date;
}

/**
 * Manually extends a doctor's subscription by N months (admin grant).
 *
 * Stripe-style anchor: if the current expiry is in the future, extend from it;
 * otherwise extend from now. Sets status 'active' and migrates a 'trial' plan to
 * 'basic' (the single paid plan), mirroring the legacy lib/subscription.ts.
 */
@Injectable()
export class ExtendDoctorSubscriptionUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly repo: IAdminRepository,
  ) {}

  async execute(input: ExtendDoctorSubscriptionInput): Promise<ExtendDoctorSubscriptionOutput> {
    const snapshot = await this.repo.getSubscriptionSnapshot(input.doctorId);
    if (!snapshot) {
      throw new DoctorNotFoundError(input.doctorId);
    }

    const now = new Date();
    const currentEnd = snapshot.expiresAt;
    const anchor = currentEnd && currentEnd > now ? currentEnd : now;
    const newExpiresAt = new Date(anchor);
    newExpiresAt.setMonth(newExpiresAt.getMonth() + input.months);

    const newPlan: SubscriptionPlan =
      snapshot.plan === 'trial' ? 'basic' : (snapshot.plan ?? 'basic');

    await this.repo.applyManualSubscriptionChange({
      doctorId: input.doctorId,
      action: 'manual_grant',
      actorId: input.actorId,
      actorRole: 'super_admin',
      reason: input.reason ?? null,
      newStatus: 'active',
      newExpiresAt,
      newPlan,
      metadata: { months_added: input.months },
    });

    return { newExpiresAt };
  }
}
