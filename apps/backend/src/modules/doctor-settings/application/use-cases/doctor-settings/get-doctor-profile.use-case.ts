import { Inject, Injectable } from '@nestjs/common';
import type { DoctorProfile } from '../../../domain/entities/doctor-profile.entity';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';

@Injectable()
export class GetDoctorProfileUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
  ) {}

  async execute(doctorId: string): Promise<DoctorProfile> {
    const profile = await this.profileRepo.findByDoctorId(doctorId);
    if (!profile) throw new DoctorProfileNotFoundError(doctorId);
    return profile;
  }
}
