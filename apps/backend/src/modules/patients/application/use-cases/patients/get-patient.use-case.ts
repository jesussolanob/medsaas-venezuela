import { Inject, Injectable, Logger } from '@nestjs/common';
import { Patient } from '../../../domain/entities/patient.entity';
import { PatientNotFoundError } from '../../../domain/errors/patient-not-found.error';
import { UnauthorizedError } from '../../../../../domain/errors/domain.error';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../domain/repositories/patient.repository';

export interface GetPatientInput {
  patientId: string;
  doctorId: string;
  /** ID of the authenticated user performing the request. */
  actorId: string;
  /** Role of the authenticated user (e.g. 'doctor'). */
  actorRole: string;
  /** Client IP from x-forwarded-for or socket. Null if unavailable. */
  ipAddress: string | null;
  /** User-Agent header value. Null if absent. */
  userAgent: string | null;
}

@Injectable()
export class GetPatientUseCase {
  private readonly logger = new Logger(GetPatientUseCase.name);

  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(input: GetPatientInput): Promise<Patient> {
    // findById is scoped to doctorId — returns null for foreign patients (double-layer defense).
    const patient = await this.patientRepo.findById(input.patientId, input.doctorId);
    if (!patient) {
      throw new PatientNotFoundError();
    }
    // Ownership check kept as second layer per domain invariant.
    if (!patient.canBeAccessedBy(input.doctorId)) {
      throw new UnauthorizedError();
    }

    // Insert one audit row for the full record view (spec: fieldRevealed='full_record').
    // Fire-and-forget on error: a log failure must not prevent the doctor from
    // accessing their patient's data.
    try {
      await this.patientRepo.logReveal({
        actorId: input.actorId,
        actorRole: input.actorRole,
        patientId: patient.id,
        fieldRevealed: 'full_record',
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    } catch {
      // Intentionally not logging the error details to avoid leaking PII context.
      this.logger.warn('audit log insert failed for patient detail view');
    }

    return patient;
  }
}
