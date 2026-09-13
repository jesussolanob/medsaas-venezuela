import { Inject, Injectable } from '@nestjs/common';
import {
  PENDING_CONSULTATION_REPOSITORY,
  type IPendingConsultationRepository,
} from '../../domain/repositories/pending-consultation.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';
import { PatientNotOwnedError } from '../../domain/errors/patient-not-owned.error';

/**
 * Per-plan summary of unused package sessions for a single patient.
 *
 * Two signals, not one — both are needed to cover the $240 re-sale case:
 *   - unusedSessions: safety net for packages whose pending rows were never
 *     generated (pre-feature data). Detected from appointment counts alone.
 *   - pendingRows: the happy path when pending_consultations rows exist and the
 *     patient can self-schedule from "Consultas por agendar".
 *
 * A package can have unusedSessions > 0 and pendingRows = 0 simultaneously,
 * which is exactly the scenario that let the specialist re-sell the package.
 */
export interface UnusedPackageSessionsRow {
  planName: string;
  /**
   * pricing_plans.sessions_count for this plan.
   * null when the plan was deleted from the catalog — unusedSessions is 0 in
   * that case since we cannot compute remaining sessions reliably.
   */
  totalSessions: number | null;
  /** Non-cancelled appointments: attended + scheduled + no_show. */
  bookedSessions: number;
  /** pending_consultations rows with status = 'pending_scheduling'. */
  pendingRows: number;
  /** max(0, totalSessions - bookedSessions). 0 when totalSessions is null. */
  unusedSessions: number;
  hasPendingRows: boolean;
}

/**
 * GetUnusedPackageSessionsUseCase
 *
 * Returns plans with remaining unused sessions or pending scheduling rows for
 * a single patient scoped to the authenticated doctor.
 *
 * Anti-IDOR:
 *   - doctorId must come from the authenticated session (caller responsibility).
 *   - patientId is verified against doctorId before any data is returned.
 *   - Identical 404 for "patient not found" and "patient belongs to another doctor".
 *
 * NEVER log patientId or planName (PII).
 */
@Injectable()
export class GetUnusedPackageSessionsUseCase {
  constructor(
    @Inject(PENDING_CONSULTATION_REPOSITORY)
    private readonly pendingRepo: IPendingConsultationRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(doctorId: string, patientId: string): Promise<UnusedPackageSessionsRow[]> {
    // Anti-IDOR: verify the patient belongs to the authenticated doctor.
    // Returns null for both "does not exist" and "belongs to another doctor".
    const patient = await this.patientRepo.findById(patientId, doctorId);
    if (!patient) {
      throw new PatientNotOwnedError(patientId);
    }

    const usageRows = await this.pendingRepo.getPackageUsage(doctorId, patientId);

    return (
      usageRows
        .map((row) => {
          // getPackageUsage already excludes cancelled appointments, so
          // attended + scheduled + noShow = all non-cancelled = "booked"
          const bookedSessions = row.attended + row.scheduled + row.noShow;

          // When totalSessions is null the plan was deleted from the catalog;
          // we cannot compute remaining sessions reliably, so treat as 0 to
          // avoid inflating the count. pendingRows still surfaces the issue.
          const unusedSessions =
            row.totalSessions != null ? Math.max(0, row.totalSessions - bookedSessions) : 0;

          const pendingRows = row.pendingScheduling;

          return {
            planName: row.planName,
            totalSessions: row.totalSessions,
            bookedSessions,
            pendingRows,
            unusedSessions,
            hasPendingRows: pendingRows > 0,
          };
        })
        // Only surface plans where something is still owed to the patient:
        //   unusedSessions > 0 → safety net (pre-feature packages, $240 case)
        //   pendingRows > 0    → happy path (patient can self-schedule)
        .filter((r) => r.unusedSessions > 0 || r.pendingRows > 0)
    );
  }
}
