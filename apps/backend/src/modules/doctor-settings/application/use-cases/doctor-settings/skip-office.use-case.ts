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
 *  1. Full idempotency guard: if `onboarding_office_skipped` is already true AND
 *     any office (active or inactive) exists for the doctor, the existing office is
 *     returned without creating a new one.
 *  2. If the doctor has at least one active office (but the skip flag is not set),
 *     no default is created. The step is marked as reached and skipped.
 *  3. If no active office exists, creates a default one:
 *     - Name: "Consultorio"
 *     - Modality: online
 *     - Schedule: Mon–Fri 08:00–17:00 (0 = Lunes convention of doctor_offices)
 *     - Slot: 50 min + 10 min buffer
 *  4. Sets onboarding_office_skipped = true and advances step to 'office'.
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
    // Full idempotency guard: if the skip was already processed AND any office
    // (active or inactive) exists, do not create a second default office.
    const profile = await this.profileRepo.findByDoctorId(doctorId);
    if (profile?.onboardingOfficeSkipped) {
      const allOffices = await this.officeRepo.listByDoctor(doctorId);
      if (allOffices.length > 0) {
        await this.profileRepo.updateOnboardingState(doctorId, {
          lastStep: 'office',
          officeSkipped: true,
        });
        return { officeSkipped: true, lastStep: 'office', officeId: allOffices[0]?.id ?? null };
      }
    }

    // Normal path: use the first active office or create a default one.
    const activeOffices = await this.officeRepo.findActiveByDoctor(doctorId);
    let officeId: string | null = activeOffices[0]?.id ?? null;

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
