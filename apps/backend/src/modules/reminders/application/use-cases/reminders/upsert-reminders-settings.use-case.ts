import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  IRemindersSettingsRepository,
  REMINDERS_SETTINGS_REPOSITORY,
} from '../../../domain/repositories/reminders-settings.repository';
import { ReminderSettings } from '../../../domain/entities/reminders-settings.entity';
import { ReminderSettingsInvalidChannelError } from '../../../domain/errors/reminders-settings-invalid-channel.error';
import { ReminderChannel } from '../../../domain/value-objects/reminder-channel.vo';
import type { UpsertRemindersSettingsDto } from '@delta/shared-types';

@Injectable()
export class UpsertRemindersSettingsUseCase {
  constructor(
    @Inject(REMINDERS_SETTINGS_REPOSITORY)
    private readonly settingsRepo: IRemindersSettingsRepository,
  ) {}

  /**
   * Upserts reminder settings for the authenticated doctor.
   *
   * - Validates the channel field against the domain value object.
   * - When no row exists yet, creates a new entity from defaults + patch.
   * - When a row exists, applies the patch immutably and persists.
   */
  async execute(doctorId: string, dto: UpsertRemindersSettingsDto): Promise<ReminderSettings> {
    // Validate channel early if provided
    if (dto.channel !== undefined && !ReminderChannel.isValid(dto.channel)) {
      throw new ReminderSettingsInvalidChannelError(dto.channel);
    }

    const existing = await this.settingsRepo.findByDoctorId(doctorId);

    const now = new Date();

    const base: ReminderSettings = existing ?? ReminderSettings.defaults(doctorId);

    const updated = base.withUpdates({
      enabled: dto.enabled,
      channel: dto.channel,
      reminder7dEnabled: dto.reminder_7d_enabled,
      reminder24hEnabled: dto.reminder_24h_enabled,
      reminder3hEnabled: dto.reminder_3h_enabled,
      reminder1hEnabled: dto.reminder_1h_enabled,
      template7dWhatsapp: dto.template_7d_whatsapp,
      template24hWhatsapp: dto.template_24h_whatsapp,
      template3hWhatsapp: dto.template_3h_whatsapp,
      quietHoursStart: dto.quiet_hours_start,
      quietHoursEnd: dto.quiet_hours_end,
      updatedAt: now,
    });

    // If the base was defaults (not persisted), assign a real id before upsert
    const toSave =
      updated.id === ''
        ? ReminderSettings.create({ ...this.toParams(updated), id: randomUUID(), createdAt: now })
        : updated;

    return this.settingsRepo.upsert(toSave);
  }

  private toParams(s: ReminderSettings) {
    return {
      id: s.id,
      doctorId: s.doctorId,
      enabled: s.enabled,
      channel: s.channel,
      reminder7dEnabled: s.reminder7dEnabled,
      reminder24hEnabled: s.reminder24hEnabled,
      reminder3hEnabled: s.reminder3hEnabled,
      reminder1hEnabled: s.reminder1hEnabled,
      template7dWhatsapp: s.template7dWhatsapp,
      template24hWhatsapp: s.template24hWhatsapp,
      template3hWhatsapp: s.template3hWhatsapp,
      quietHoursStart: s.quietHoursStart,
      quietHoursEnd: s.quietHoursEnd,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}
