import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../../domain/repositories/admin.repository';
import type { DoctorWithActivity } from '../../../domain/entities/doctor-with-activity.entity';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';

export interface GetDoctorDetailInput {
  doctorId: string;
}

/**
 * Returns the full detail of a single doctor, including subscription and activity status.
 *
 * Throws DoctorNotFoundError when no doctor profile with the given ID exists.
 */
@Injectable()
export class GetDoctorDetailUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: GetDoctorDetailInput): Promise<DoctorWithActivity> {
    const doctor = await this.adminRepo.findDoctorById(input.doctorId);
    if (!doctor) throw new DoctorNotFoundError(input.doctorId);
    return doctor;
  }
}
