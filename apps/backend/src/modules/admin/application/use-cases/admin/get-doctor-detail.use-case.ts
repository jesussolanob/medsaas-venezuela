import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type DoctorDetail,
} from '../../../domain/repositories/admin.repository';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';

export interface GetDoctorDetailInput {
  doctorId: string;
}

/**
 * Returns the enriched detail of a single doctor including profile fields,
 * subscription data, activity status, and current-month stats.
 *
 * Throws DoctorNotFoundError when no doctor profile with the given ID exists.
 */
@Injectable()
export class GetDoctorDetailUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: GetDoctorDetailInput): Promise<DoctorDetail> {
    const doctor = await this.adminRepo.findDoctorDetail(input.doctorId);
    if (!doctor) throw new DoctorNotFoundError(input.doctorId);
    return doctor;
  }
}
