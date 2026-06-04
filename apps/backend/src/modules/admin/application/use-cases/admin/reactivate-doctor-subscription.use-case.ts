import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../../domain/repositories/admin.repository';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';

export interface ReactivateDoctorSubscriptionInput {
  doctorId: string;
  actorId: string;
}

export interface ReactivateDoctorSubscriptionOutput {
  newExpiresAt: Date | null;
}

/**
 * Reactivates a suspended subscription (status → 'active'). If the subscription is
 * already expired, grants a fresh 1-month period (mirrors legacy lib/subscription.ts).
 */
@Injectable()
export class ReactivateDoctorSubscriptionUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly repo: IAdminRepository,
  ) {}

  async execute(
    input: ReactivateDoctorSubscriptionInput,
  ): Promise<ReactivateDoctorSubscriptionOutput> {
    const snapshot = await this.repo.getSubscriptionSnapshot(input.doctorId);
    if (!snapshot) {
      throw new DoctorNotFoundError(input.doctorId);
    }

    const now = new Date();
    const isExpired = !snapshot.expiresAt || snapshot.expiresAt < now;
    let newExpiresAt: Date | null = null;
    if (isExpired) {
      newExpiresAt = new Date(now);
      newExpiresAt.setMonth(newExpiresAt.getMonth() + 1);
    }

    await this.repo.applyManualSubscriptionChange({
      doctorId: input.doctorId,
      action: 'reactivated',
      actorId: input.actorId,
      actorRole: 'super_admin',
      newStatus: 'active',
      newExpiresAt: newExpiresAt ?? undefined,
    });

    return { newExpiresAt };
  }
}
