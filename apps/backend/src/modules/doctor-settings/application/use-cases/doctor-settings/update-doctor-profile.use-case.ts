import { Inject, Injectable } from '@nestjs/common';
import type {
  DoctorProfile,
  DoctorProfileUpdateParams,
} from '../../../domain/entities/doctor-profile.entity';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';

@Injectable()
export class UpdateDoctorProfileUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
  ) {}

  async execute(doctorId: string, params: DoctorProfileUpdateParams): Promise<DoctorProfile> {
    // Verify the profile exists before updating
    const existing = await this.profileRepo.findByDoctorId(doctorId);
    if (!existing) throw new DoctorProfileNotFoundError(doctorId);

    return this.profileRepo.update(doctorId, params);
  }
}
