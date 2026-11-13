import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type {
  DoctorProfile,
  DoctorProfileUpdateParams,
} from '../../../domain/entities/doctor-profile.entity';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';
import { VerifyMppsUseCase } from '../../../../credential-verification/application/use-cases/verify-mpps.use-case';

@Injectable()
export class UpdateDoctorProfileUseCase {
  private readonly logger = new Logger(UpdateDoctorProfileUseCase.name);

  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
    /**
     * Optional: triggers a new MPPS verification when the doctor updates their
     * mppsNumber. Fire-and-forget — a failure here never blocks the profile update.
     * Uses @Optional so the use case stays constructable in test contexts where
     * CredentialVerificationModule is not imported.
     *
     * @Inject is mandatory: TypeScript emits `Object` for union types with null,
     * so without the explicit token Nest injected null silently (@Optional) and
     * the re-verification never ran in staging while every test stayed green.
     */
    @Optional()
    @Inject(VerifyMppsUseCase)
    private readonly verifyMpps: VerifyMppsUseCase | null = null,
  ) {}

  async execute(doctorId: string, params: DoctorProfileUpdateParams): Promise<DoctorProfile> {
    // Verify the profile exists before updating
    const existing = await this.profileRepo.findByDoctorId(doctorId);
    if (!existing) throw new DoctorProfileNotFoundError(doctorId);

    // Check whether mppsNumber is being changed so we know to re-trigger verification.
    // The comparison is done BEFORE the update to capture the current value.
    // Note: normalization (trim, uppercase) of mppsNumber happens on the client;
    // the backend stores whatever the doctor sends. The verification logic normalizes.
    const mppsChanged = 'mppsNumber' in params && params.mppsNumber !== existing.mppsNumber;

    const updated = await this.profileRepo.update(doctorId, params);

    // Fire-and-forget MPPS verification when the doctor's mppsNumber changes.
    // Not forced on purpose: the use case applies the 15-minute cooldown, so
    // repeated edits can't hammer the SACS portal.
    // A failure must never surface as an error on the profile update endpoint.
    // We never log the actual mppsNumber value (PII-adjacent).
    if (mppsChanged) {
      this.logger.log(
        `[update-profile] doctorId=${doctorId} mpps changed — verifier ${this.verifyMpps ? 'wired' : 'MISSING'}`,
      );
    }
    if (mppsChanged && this.verifyMpps) {
      this.verifyMpps.execute(doctorId).catch(() => {
        this.logger.error(
          `[update-profile] mpps re-verification fire-and-forget failed for doctorId=${doctorId}`,
        );
      });
    }

    return updated;
  }
}
