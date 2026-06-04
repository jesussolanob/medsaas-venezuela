import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../../domain/repositories/admin.repository';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';

export interface SuspendDoctorSubscriptionInput {
  doctorId: string;
  actorId: string;
  reason?: string | null;
}

/**
 * Suspends a doctor's subscription (status → 'suspended'). The expiry date is left
 * untouched so it can be restored on reactivation.
 */
@Injectable()
export class SuspendDoctorSubscriptionUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly repo: IAdminRepository,
  ) {}

  async execute(input: SuspendDoctorSubscriptionInput): Promise<void> {
    const snapshot = await this.repo.getSubscriptionSnapshot(input.doctorId);
    if (!snapshot) {
      throw new DoctorNotFoundError(input.doctorId);
    }

    await this.repo.applyManualSubscriptionChange({
      doctorId: input.doctorId,
      action: 'suspended',
      actorId: input.actorId,
      actorRole: 'super_admin',
      reason: input.reason ?? null,
      newStatus: 'suspended',
    });
  }
}
