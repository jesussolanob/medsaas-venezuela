import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { WhereOptions } from 'sequelize';
import { ReminderSettings } from '../../../domain/entities/reminders-settings.entity';
import type { IRemindersSettingsRepository } from '../../../domain/repositories/reminders-settings.repository';
import { RemindersSettingsModel } from '../models/reminders-settings.model';
import type { ReminderChannelValue } from '../../../domain/value-objects/reminder-channel.vo';

/**
 * Sequelize implementation of IRemindersSettingsRepository.
 *
 * Converts between RemindersSettingsModel (infrastructure) and ReminderSettings (domain).
 * Uses upsert based on the UNIQUE constraint on doctor_id.
 */
@Injectable()
export class SequelizeRemindersSettingsRepository implements IRemindersSettingsRepository {
  constructor(
    @InjectModel(RemindersSettingsModel)
    private readonly model: typeof RemindersSettingsModel,
  ) {}

  async findByDoctorId(doctorId: string): Promise<ReminderSettings | null> {
    const row = await this.model.findOne({
      where: { doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async upsert(settings: ReminderSettings): Promise<ReminderSettings> {
    const [row] = await this.model.upsert({
      id: settings.id,
      doctorId: settings.doctorId,
      enabled: settings.enabled,
      channel: settings.channel,
      reminder7dEnabled: settings.reminder7dEnabled,
      reminder24hEnabled: settings.reminder24hEnabled,
      reminder3hEnabled: settings.reminder3hEnabled,
      reminder1hEnabled: settings.reminder1hEnabled,
      template7dWhatsapp: settings.template7dWhatsapp,
      template24hWhatsapp: settings.template24hWhatsapp,
      template3hWhatsapp: settings.template3hWhatsapp,
      quietHoursStart: settings.quietHoursStart,
      quietHoursEnd: settings.quietHoursEnd,
    });
    return this.toDomain(row);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: RemindersSettingsModel): ReminderSettings {
    return ReminderSettings.create({
      id: row.id,
      doctorId: row.doctorId,
      enabled: row.enabled,
      channel: row.channel as ReminderChannelValue,
      reminder7dEnabled: row.reminder7dEnabled,
      reminder24hEnabled: row.reminder24hEnabled,
      reminder3hEnabled: row.reminder3hEnabled,
      reminder1hEnabled: row.reminder1hEnabled,
      template7dWhatsapp: row.template7dWhatsapp,
      template24hWhatsapp: row.template24hWhatsapp,
      template3hWhatsapp: row.template3hWhatsapp,
      quietHoursStart: row.quietHoursStart,
      quietHoursEnd: row.quietHoursEnd,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
