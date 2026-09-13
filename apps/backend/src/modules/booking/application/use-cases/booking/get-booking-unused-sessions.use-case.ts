import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  PENDING_CONSULTATION_REPOSITORY,
  type IPendingConsultationRepository,
} from '../../../../pending-consultations/domain/repositories/pending-consultation.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../../patients/domain/repositories/patient.repository';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';
import { InvalidEmailError } from './get-booking-packages.use-case';

/**
 * Safe summary of a multi-session plan with remaining sessions.
 * No patient_id or any PII is included in the response.
 */
export interface BookingUnusedSessionsRow {
  planName: string;
  /**
   * pricing_plans.sessions_count for this plan.
   * null when the plan was deleted from the catalog.
   */
  totalSessions: number | null;
  /** max(0, totalSessions - bookedSessions). 0 when totalSessions is null. */
  unusedSessions: number;
  /** pending_consultations rows with status = 'pending_scheduling'. */
  pendingRows: number;
  hasPendingRows: boolean;
}

/**
 * GetBookingUnusedSessionsUseCase
 *
 * Public counterpart of GetUnusedPackageSessionsUseCase for the booking widget.
 * Identifies the patient by email hash (never plaintext), then returns which
 * multi-session plans still have sessions owed to them.
 *
 * Security:
 *   - Email is validated with Zod before hashing (same as GetBookingPackagesUseCase).
 *   - Patient is looked up by email_hash — plaintext email never reaches the DB.
 *   - No patient_id, no PII is included in the response.
 *   - Unknown email → empty array (not an error) — prevents email enumeration.
 *
 * This endpoint is INFORMATIONAL ONLY. It surfaces the warning that the patient
 * already has unused sessions; the caller decides whether to block or warn.
 * It does NOT modify any state.
 *
 * NEVER log email, emailHash, or patient_id (PII).
 */
@Injectable()
export class GetBookingUnusedSessionsUseCase {
  constructor(
    @Inject(PENDING_CONSULTATION_REPOSITORY)
    private readonly pendingRepo: IPendingConsultationRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    private readonly crypto: CryptoService,
  ) {}

  async execute(doctorId: string, email: string): Promise<BookingUnusedSessionsRow[]> {
    // Validate email format — bad format → 400, not 500 (matches GetBookingPackagesUseCase).
    const parsed = z.string().email().safeParse(email);
    if (!parsed.success) {
      throw new InvalidEmailError();
    }

    const emailHash = this.crypto.hashForSearch(parsed.data);

    // Patient lookup by email hash. Returns null when the patient has never
    // booked with this doctor — treat as zero packages rather than an error.
    const patient = await this.patientRepo.findByEmailHash(emailHash, doctorId);
    if (!patient) {
      return [];
    }

    const usageRows = await this.pendingRepo.getPackageUsage(doctorId, patient.id);

    return usageRows
      .map((row) => {
        const bookedSessions = row.attended + row.scheduled + row.noShow;
        const unusedSessions =
          row.totalSessions != null ? Math.max(0, row.totalSessions - bookedSessions) : 0;
        const pendingRows = row.pendingScheduling;

        return {
          planName: row.planName,
          totalSessions: row.totalSessions,
          unusedSessions,
          pendingRows,
          hasPendingRows: pendingRows > 0,
          // bookedSessions intentionally omitted — not needed in the public response,
          // and surfacing it would make the response slightly more fingerprintable.
        };
      })
      .filter((r) => r.unusedSessions > 0 || r.pendingRows > 0);
  }
}
