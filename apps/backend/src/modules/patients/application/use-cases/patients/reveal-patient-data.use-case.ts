import { Inject, Injectable } from '@nestjs/common';
import { Patient } from '../../../domain/entities/patient.entity';
import { PatientNotFoundError } from '../../../domain/errors/patient-not-found.error';
import { UnauthorizedError } from '../../../../../domain/errors/domain.error';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../domain/repositories/patient.repository';

export interface RevealPatientDataInput {
  patientId: string;
  doctorId: string;
  actorId: string;
  actorRole: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/** PII fields that are always logged on reveal. */
const REVEAL_FIELDS = ['full_name', 'cedula', 'phone', 'email'] as const;

@Injectable()
export class RevealPatientDataUseCase {
  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(input: RevealPatientDataInput): Promise<Patient> {
    // findById is scoped to doctorId — returns null for foreign patients (double-layer defense).
    const patient = await this.patientRepo.findById(input.patientId, input.doctorId);
    if (!patient) {
      throw new PatientNotFoundError();
    }
    if (!patient.canBeAccessedBy(input.doctorId)) {
      throw new UnauthorizedError();
    }

    // Log one audit row per PII field revealed (spec T-17)
    const logEntries = REVEAL_FIELDS.map((field) =>
      this.patientRepo.logReveal({
        actorId: input.actorId,
        actorRole: input.actorRole,
        patientId: patient.id,
        fieldRevealed: field,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      }),
    );

    await Promise.all(logEntries);

    return patient;
  }
}
