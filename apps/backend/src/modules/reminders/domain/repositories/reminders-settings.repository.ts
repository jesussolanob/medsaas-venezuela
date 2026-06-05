import type { ReminderSettings } from '../entities/reminders-settings.entity';

export const REMINDERS_SETTINGS_REPOSITORY = 'REMINDERS_SETTINGS_REPOSITORY';

/**
 * Contract for ReminderSettings persistence.
 *
 * The application layer depends only on this interface — never on the Sequelize
 * implementation — keeping the domain layer infrastructure-free.
 *
 * The table has a UNIQUE constraint on doctor_id, so there is at most one row
 * per doctor. The upsert operation handles both insert and update transparently.
 */
export interface IRemindersSettingsRepository {
  /**
   * Returns the settings for a given doctorId, or null if not yet configured.
   * The caller should return ReminderSettings.defaults(doctorId) on null.
   */
  findByDoctorId(doctorId: string): Promise<ReminderSettings | null>;

  /**
   * Upserts the settings for a doctor (INSERT … ON CONFLICT DO UPDATE).
   * Returns the persisted entity.
   */
  upsert(settings: ReminderSettings): Promise<ReminderSettings>;
}
