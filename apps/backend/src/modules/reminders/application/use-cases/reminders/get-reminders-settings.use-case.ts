import { Inject, Injectable } from '@nestjs/common';
import {
  IRemindersSettingsRepository,
  REMINDERS_SETTINGS_REPOSITORY,
} from '../../../domain/repositories/reminders-settings.repository';
import { ReminderSettings } from '../../../domain/entities/reminders-settings.entity';

@Injectable()
export class GetRemindersSettingsUseCase {
  constructor(
    @Inject(REMINDERS_SETTINGS_REPOSITORY)
    private readonly settingsRepo: IRemindersSettingsRepository,
  ) {}

  /**
   * Returns the reminder settings for the authenticated doctor.
   * When no row exists yet, returns the default settings (no 404).
   */
  async execute(doctorId: string): Promise<ReminderSettings> {
    const existing = await this.settingsRepo.findByDoctorId(doctorId);
    return existing ?? ReminderSettings.defaults(doctorId);
  }
}
