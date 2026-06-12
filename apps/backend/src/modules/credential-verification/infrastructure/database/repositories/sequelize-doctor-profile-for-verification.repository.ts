import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { RegistrationProfileModel } from '../../../../doctor-registration/infrastructure/database/models/registration-profile.model';
import type {
  IDoctorProfileForVerificationRepository,
  DoctorProfileForVerification,
} from '../../../domain/repositories/doctor-profile.repository';

/**
 * Read-only Sequelize repository that fetches doctor profile fields needed
 * for credential verification. Reuses the existing profiles table via the
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
}
