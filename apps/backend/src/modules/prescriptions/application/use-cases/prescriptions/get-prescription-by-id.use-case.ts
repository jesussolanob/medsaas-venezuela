import { Inject, Injectable } from '@nestjs/common';
import { Prescription } from '../../../domain/entities/prescription.entity';
import { PrescriptionNotFoundError } from '../../../domain/errors/prescription-not-found.error';
import { PrescriptionAccessDeniedError } from '../../../domain/errors/prescription-access-denied.error';
import {
  IPrescriptionRepository,
  PRESCRIPTION_REPOSITORY,
} from '../../../domain/repositories/prescription.repository';

export interface GetPrescriptionByIdInput {
  prescriptionId: string;
  doctorId: string;
}

/**
 * Returns a single prescription by ID.
 *
 * SECURITY: ownership is enforced — a doctor can only access their own prescriptions.
 */
@Injectable()
export class GetPrescriptionByIdUseCase {
  constructor(
    @Inject(PRESCRIPTION_REPOSITORY)
    private readonly repo: IPrescriptionRepository,
  ) {}

  async execute(input: GetPrescriptionByIdInput): Promise<Prescription> {
    const prescription = await this.repo.findById(input.prescriptionId, input.doctorId);
    if (!prescription) {
      throw new PrescriptionNotFoundError();
    }
    // Defense-in-depth: findById already scopes by doctorId, but we enforce
    // ownership explicitly so any future repo change cannot bypass this check.
    if (!prescription.canBeModifiedBy(input.doctorId)) {
      throw new PrescriptionAccessDeniedError();
    }
    return prescription;
  }
}
