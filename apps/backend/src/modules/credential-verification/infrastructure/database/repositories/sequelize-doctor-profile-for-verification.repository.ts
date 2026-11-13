import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { RegistrationProfileModel } from '../../../../doctor-registration/infrastructure/database/models/registration-profile.model';
import type {
  IDoctorProfileForVerificationRepository,
  DoctorProfileForVerification,
} from '../../../domain/repositories/doctor-profile.repository';

/**
 * Sequelize repository that provides doctor profile fields needed for
 * credential verification. Reuses the existing profiles table via the
 * RegistrationProfileModel (which is forFeature-registered in this module).
 */
@Injectable()
export class SequelizeDoctorProfileForVerificationRepository implements IDoctorProfileForVerificationRepository {
  constructor(
    @InjectModel(RegistrationProfileModel)
    private readonly model: typeof RegistrationProfileModel,
  ) {}

  async findById(doctorId: string): Promise<DoctorProfileForVerification | null> {
    const row = await this.model.findByPk(doctorId, {
      attributes: ['id', 'cedula', 'mppsNumber', 'fullName'],
    });

    if (!row) return null;

    return {
      id: row.id,
      cedula: row.cedula,
      mppsNumber: row.mppsNumber,
      fullName: row.fullName,
    };
  }

  /**
   * Promotes verification_status to 'verified' ONLY when it is currently 'pending'.
   * Sets verified_at = now(), verified_by = NULL (system-automated, no human actor).
   *
   * The WHERE guard makes this a no-op for 'rejected' (admin decision) and for
   * already-verified rows (idempotent).
   */
  async promoteToVerified(doctorId: string): Promise<void> {
    await this.model.update(
      {
        verificationStatus: 'verified',
        verifiedAt: new Date(),
        verifiedBy: null,
      },
      {
        where: {
          id: doctorId,
          verificationStatus: 'pending',
        },
      },
    );
  }
}
