import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prescription } from '../../../domain/entities/prescription.entity';
import { PatientNotOwnedError } from '../../../domain/errors/patient-not-owned.error';
import {
  IPrescriptionRepository,
  PRESCRIPTION_REPOSITORY,
} from '../../../domain/repositories/prescription.repository';
import {
  IPatientRepository,
  PATIENT_REPOSITORY,
} from '../../../../patients/domain/repositories/patient.repository';

export interface CreatePrescriptionInput {
  doctorId: string;
  patientId?: string | null;
  consultationId?: string | null;
  medication: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  notes?: string | null;
}

/**
 * Creates a new prescription.
 *
 * SECURITY: doctorId is always taken from the authenticated user token — never
 * from the request body.
 *
 * OWNERSHIP: when patientId is provided, we verify the doctor owns the patient
 * before persisting. A doctor cannot create prescriptions linked to another
 * doctor's patients. If the patient doesn't exist or belongs to another doctor,
 * PatientNotOwnedError is thrown (maps to 422 via GlobalExceptionFilter).
 * Intentionally uses generic "not found" language to prevent resource
 * enumeration.
 *
 * TODO (patient-portal): add patient access to GET endpoints when patient-portal
 * module is implemented.
 */
@Injectable()
export class CreatePrescriptionUseCase {
  constructor(
    @Inject(PRESCRIPTION_REPOSITORY)
    private readonly repo: IPrescriptionRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(input: CreatePrescriptionInput): Promise<Prescription> {
    // Verify patient ownership when a patient is associated with this prescription.
    if (input.patientId) {
      const patient = await this.patientRepo.findById(input.patientId, input.doctorId);
      if (!patient) {
        throw new PatientNotOwnedError();
      }
    }

    const now = new Date();
    const prescription = Prescription.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      patientId: input.patientId ?? null,
      consultationId: input.consultationId ?? null,
      medication: input.medication,
      dosage: input.dosage ?? null,
      frequency: input.frequency ?? null,
      duration: input.duration ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return this.repo.save(prescription);
  }
}
