import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type DoctorPatientRow,
  type BulkAuditEntry,
} from '../../../domain/repositories/admin.repository';

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
 *   - Inserts ONE audit row per patient returned in access_audit_log with
 *     fieldRevealed='admin_patient_identity' and the real patient UUID as patientId.
 *     All rows are written in a single bulk insert statement.
 *   - Zero patients → zero audit rows (no-op).
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

    if (patients.length > 0) {
      // Build one audit entry per patient — each entry uses the real patient UUID
      // so the FK constraint on access_audit_log.patient_id is satisfied.
      // The reason column identifies which doctor's patient list was accessed
      // (no patient names or PII in the reason string).
      const reason = `listado de pacientes del especialista ${input.doctorId}`;
      const entries: BulkAuditEntry[] = patients.map((p) => ({
        actorId: input.actorId,
        actorRole: input.actorRole,
        patientId: p.id,
        fieldRevealed: 'admin_patient_identity',
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        reason,
      }));

      // Fire-and-forget: audit failure must not block the admin response.
      this.adminRepo.logAdminRevealBulk(entries).catch((err: unknown) => {
        this.logger.error(
          'bulk audit log insert failed for admin doctor-patients listing',
          err instanceof Error ? err.message : String(err),
        );
      });
    }

    return patients;
  }
}
