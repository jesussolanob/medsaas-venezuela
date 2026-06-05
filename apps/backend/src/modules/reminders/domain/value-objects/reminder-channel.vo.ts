/**
 * ReminderChannel value object.
 *
 * Represents the valid delivery channels for appointment reminders.
 * No external imports — pure domain logic.
 */

export const REMINDER_CHANNELS = ['whatsapp', 'email', 'both'] as const;

export type ReminderChannelValue = (typeof REMINDER_CHANNELS)[number];

export class ReminderChannel {
  readonly value: ReminderChannelValue;

  private constructor(value: ReminderChannelValue) {
    this.value = value;
  }

  static create(value: string): ReminderChannel {
    if (!REMINDER_CHANNELS.includes(value as ReminderChannelValue)) {
      throw new RangeError(
        `Invalid reminder channel: "${value}". Must be one of: ${REMINDER_CHANNELS.join(', ')}`,
      );
    }
    return new ReminderChannel(value as ReminderChannelValue);
  }

  static isValid(value: string): value is ReminderChannelValue {
    return REMINDER_CHANNELS.includes(value as ReminderChannelValue);
  }

  equals(other: ReminderChannel): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
