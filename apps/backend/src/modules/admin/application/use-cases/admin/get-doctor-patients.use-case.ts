import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type DoctorPatientRow,
} from '../../../domain/repositories/admin.repository';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';

export interface GetDoctorPatientsInput {
  /** UUID of the doctor whose patients are being requested. */
  doctorId: string;
  /** UUID of the authenticated super_admin performing the request. */
  actorId: string;
  /** Role of the authenticated actor — always 'super_admin' for this use case. */
  actorRole: string;
  /** Client IP from x-forwarded-for or socket. Null if unavailable. */
  ipAddress: string | null;
  /** User-Agent header value. Null if absent. */
  userAgent: string | null;
}

/**
 * Returns the list of patients attended by a specific doctor.
 *
 * Each row exposes only non-medical identity (fullName, cedula, consultationCount,
 * lastAttendedAt). No diagnosis, treatment, EHR, prescriptions, phone, or email
 * are included.
 *
 * Security invariants:
 *   - Validates the doctor exists before any PII is revealed (DoctorNotFoundError → 404).
 *   - Inserts ONE audit row per request in access_audit_log with
 *     fieldRevealed='admin_patient_identity' and reason=doctorId being queried.
 *   - Audit failure is fire-and-forget: a log error must not block the response.
 */
@Injectable()
export class GetDoctorPatientsUseCase {
  private readonly logger = new Logger(GetDoctorPatientsUseCase.name);

  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: GetDoctorPatientsInput): Promise<DoctorPatientRow[]> {
    // listDoctorPatients throws DoctorNotFoundError if doctorId does not exist.
    const patients = await this.adminRepo.listDoctorPatients(input.doctorId);

    // Record one audit row summarising this admin access (reveals PII of N patients).
    // We log with a synthetic patient_id representing the doctor being queried,
    // which is the most meaningful identifier available for this bulk-reveal action.
    // The reason field records which doctor's patients were exposed.
    try {
      await this.adminRepo.logAdminReveal({
        actorId: input.actorId,
        actorRole: input.actorRole,
        // patient_id column is NOT NULL — use doctorId as a proxy identifier for
        // this bulk-identity-reveal action (no single patient_id applies).
        patientId: input.doctorId,
        fieldRevealed: 'admin_patient_identity',
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        reason: `admin listed patients for doctor ${input.doctorId}`,
      });
    } catch {
      // Intentionally swallowed — audit failure must not prevent the admin from
      // accessing data. The warning is logged at WARN level (no PII in message).
      this.logger.warn('audit log insert failed for admin doctor-patients listing');
    }

    return patients;
  }
}
