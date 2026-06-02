import { Inject, Injectable } from '@nestjs/common';
import { PatientPackage } from '../../../domain/entities/patient-package.entity';
import {
  PACKAGE_REPOSITORY,
  type IPackageRepository,
} from '../../../domain/repositories/package.repository';

export interface GetPatientPackagesInput {
  patientId: string;
  doctorId: string;
}

/**
 * Retrieves all packages for a specific patient, scoped to the requesting doctor.
 * Ownership is enforced by the repository query — only packages where doctor_id
 * matches are returned, preventing cross-doctor enumeration.
 */
@Injectable()
export class GetPatientPackagesUseCase {
  constructor(
    @Inject(PACKAGE_REPOSITORY)
    private readonly packageRepo: IPackageRepository,
  ) {}

  async execute(input: GetPatientPackagesInput): Promise<PatientPackage[]> {
    return this.packageRepo.findByPatientId(input.patientId, input.doctorId);
  }
}
