import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';
import {
  OFFICE_REPOSITORY,
  type IOfficeRepository,
} from '../../../../offices/domain/repositories/office.repository';
import { CreateOfficeUseCase } from '../../../../offices/application/use-cases/offices/create-office.use-case';

export interface SkipOfficeOutput {
  officeSkipped: boolean;
  lastStep: string;
  /** Id of the default office created (new) or the existing active office's id. */
  officeId: string | null;
}

/**
 * Handles the "Omitir" button on the Office step of the minimum onboarding wizard.
 *
 * Behavior:
 *  1. If the doctor already has at least one active office, no default is created
 *     (idempotent). The step is still marked as reached and skipped.
 *  2. If no active office exists, creates a default one:
 *     - Name: "Consultorio"
 *     - Modality: online
 *     - Schedule: Mon–Fri 08:00–17:00 (0 = Lunes convention of doctor_offices)
 *     - Slot: 50 min + 10 min buffer
 *  3. Sets onboarding_office_skipped = true and advances step to 'office'.
 *
 * Idempotent: safe to call multiple times.
 *
 * SECURITY: doctorId always comes from the authenticated token (anti-IDOR).
 */
@Injectable()
export class SkipOfficeUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
    private readonly createOffice: CreateOfficeUseCase,
  ) {}

  async execute(doctorId: string): Promise<SkipOfficeOutput> {
    const existing = await this.officeRepo.findActiveByDoctor(doctorId);

    let officeId: string | null = existing[0]?.id ?? null;

    if (!officeId) {
      // Create a default office so the doctor can receive bookings immediately.
      // Days 0–4 = Mon–Fri in the doctor_offices convention (0=Lunes).
      const created = await this.createOffice.execute(
        {
          name: 'Consultorio',
          address: '',
          city: '',
          phone: '',
          modality: 'online',
          slot_duration: 50,
          buffer_minutes: 10,
          schedule: [
            { day: 0, enabled: true, start: '08:00', end: '17:00' },
            { day: 1, enabled: true, start: '08:00', end: '17:00' },
            { day: 2, enabled: true, start: '08:00', end: '17:00' },
            { day: 3, enabled: true, start: '08:00', end: '17:00' },
            { day: 4, enabled: true, start: '08:00', end: '17:00' },
          ],
        },
        doctorId,
      );
      officeId = created.id;
    }

    // Advance step tracker and mark as skipped (atomic).
    await this.profileRepo.updateOnboardingState(doctorId, {
      lastStep: 'office',
      officeSkipped: true,
    });

    return { officeSkipped: true, lastStep: 'office', officeId };
  }
}
