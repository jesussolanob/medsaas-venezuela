import { Inject, Injectable } from '@nestjs/common';
import {
  PACKAGE_REPOSITORY,
  type IPackageRepository,
} from '../../../domain/repositories/package.repository';
import type { PatientPackage } from '../../../domain/entities/patient-package.entity';

export interface GetDoctorPackagesInput {
  doctorId: string;
  patientId?: string | null;
  status?: 'active' | 'completed' | null;
}

/**
 * GetDoctorPackagesUseCase
 *
 * Returns all patient_packages for the authenticated doctor.
 * Optionally filters by patient or status.
 *
 * SECURITY: doctorId is always taken from user.sub (the authenticated token)
 * — never from the request body. The repository scopes every query to doctorId
 * so cross-doctor access is structurally impossible.
 */
@Injectable()
export class GetDoctorPackagesUseCase {
  constructor(
    @Inject(PACKAGE_REPOSITORY)
    private readonly packageRepo: IPackageRepository,
  ) {}

  async execute(input: GetDoctorPackagesInput): Promise<PatientPackage[]> {
    return this.packageRepo.listByDoctor({
      doctorId: input.doctorId,
      patientId: input.patientId ?? undefined,
      status: input.status ?? undefined,
    });
  }
}
