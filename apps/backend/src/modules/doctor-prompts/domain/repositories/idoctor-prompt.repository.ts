import type { DoctorPrompt } from '../entities/doctor-prompt.entity';

export const DOCTOR_PROMPT_REPOSITORY = Symbol('IDoctorPromptRepository');

export interface AppSettingRow {
  key: string;
  value: string;
}

export interface IDoctorPromptRepository {
  /**
   * Returns the prompt row for the given doctor and key.
   * Returns null when not found (first time).
   */
  findByDoctorAndKey(doctorId: string, promptKey: string): Promise<DoctorPrompt | null>;

  /**
   * Upserts the shown state: increments shown_count, sets first_shown_at (if null),
   * and updates last_shown_at to now. Creates the row if it does not exist.
   */
  recordShown(doctorId: string, promptKey: string, now: Date): Promise<DoctorPrompt>;

  /**
   * Upserts the snooze state: sets snoozed_until = now + snooze_days.
   * Creates the row if it does not exist.
   */
  recordSnooze(
    doctorId: string,
    promptKey: string,
    snoozedUntil: Date,
    now: Date,
  ): Promise<DoctorPrompt>;

  /**
   * Upserts the dismiss state: sets dismissed_at = now.
   * Creates the row if it does not exist.
   */
  recordDismiss(doctorId: string, promptKey: string, now: Date): Promise<DoctorPrompt>;

  /**
   * Sets acted_at = now on the prompt row (if it exists).
   * Creates the row if it does not exist.
   * Used when the doctor books a meeting after seeing the modal.
   */
  recordActed(doctorId: string, promptKey: string, now: Date): Promise<void>;

  /**
   * Clears acted_at on the prompt row (set to null).
   * Used when a meeting is cancelled so the modal can reappear.
   */
  clearActed(doctorId: string, promptKey: string): Promise<void>;

  /**
   * Checks whether the doctor has at least one phase-4 email prompt row
   * (email:meeting_invite_pre or email:meeting_invite_expired).
   * These rows allow the modal to bypass the max-shows limit.
   */
  hasPhase4EmailPrompt(doctorId: string): Promise<boolean>;

  /**
   * Returns app_settings values for the given keys.
   */
  getSettings(keys: string[]): Promise<AppSettingRow[]>;

  /**
   * Returns the timestamp of the doctor's profile creation (profiles.created_at).
   * Used to evaluate meeting_prompt_min_days.
   */
  getDoctorCreatedAt(doctorId: string): Promise<Date | null>;

  /**
   * Returns true when the doctor has at least one pending contact request.
   * Used to gate the meeting prompt.
   */
  hasPendingContactRequest(doctorId: string): Promise<boolean>;

  /**
   * Returns true when the doctor has a scheduled or done team meeting.
   * Used to gate the meeting prompt.
   */
  hasScheduledOrDoneTeamMeeting(doctorId: string): Promise<boolean>;
}
