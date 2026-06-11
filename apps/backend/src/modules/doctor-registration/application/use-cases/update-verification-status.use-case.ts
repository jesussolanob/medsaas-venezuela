import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DOCTOR_REGISTRATION_REPOSITORY,
  type IDoctorRegistrationRepository,
} from '../../domain/repositories/doctor-registration.repository';
import { DoctorRegistrationNotFoundError } from '../../domain/errors/doctor-not-found.error';
import { InvalidVerificationStatusError } from '../../domain/errors/invalid-verification-status.error';

export interface UpdateVerificationStatusInput {
  doctorId: string;
  status: 'verified' | 'rejected';
  actorId: string;
}

export interface UpdateVerificationStatusOutput {
  doctorId: string;
  verificationStatus: 'verified' | 'rejected';
  verifiedAt: Date;
  verifiedBy: string;
}

/**
 * UpdateVerificationStatusUseCase
 *
 * Called by PUT /api/admin/doctor-verifications/:doctorId.
 * Guarded by @Roles('super_admin') at the controller level.
 *
 * NOTE: Verification status does NOT restrict system access in Etapa 1.
 * This is preparatory metadata for future access control.
 *
 * SECURITY: Never log doctorId together with full_name/cedula.
 */
@Injectable()
export class UpdateVerificationStatusUseCase {
  private readonly logger = new Logger(UpdateVerificationStatusUseCase.name);

  constructor(
    @Inject(DOCTOR_REGISTRATION_REPOSITORY)
    private readonly repo: IDoctorRegistrationRepository,
  ) {}

  async execute(input: UpdateVerificationStatusInput): Promise<UpdateVerificationStatusOutput> {
    if (input.status !== 'verified' && input.status !== 'rejected') {
      throw new InvalidVerificationStatusError(input.status);
    }

    const existing = await this.repo.findById(input.doctorId);
    if (!existing) {
      throw new DoctorRegistrationNotFoundError(input.doctorId);
    }

    const verifiedAt = new Date();

    const updated = await this.repo.updateVerification(input.doctorId, {
      status: input.status,
      verifiedBy: input.actorId,
      verifiedAt,
    });

    this.logger.log(
      `[verification] doctorId=${input.doctorId} status=${input.status} by=${input.actorId}`,
    );

    return {
      doctorId: updated.id,
      verificationStatus: updated.verificationStatus as 'verified' | 'rejected',
      verifiedAt: updated.verifiedAt ?? verifiedAt,
      verifiedBy: updated.verifiedBy ?? input.actorId,
    };
  }
}
