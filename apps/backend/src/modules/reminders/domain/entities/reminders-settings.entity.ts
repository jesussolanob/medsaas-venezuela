import type { ReminderChannelValue } from '../value-objects/reminder-channel.vo';

/**
 * Default values for ReminderSettings.
 *
 * Used when a doctor has not yet configured their settings — the GET endpoint
 * returns these instead of a 404, so no settings creation is required upfront.
 */
export const REMINDERS_SETTINGS_DEFAULTS = {
  enabled: true,
  channel: 'both' as ReminderChannelValue,
  reminder7dEnabled: true,
  reminder24hEnabled: true,
  reminder3hEnabled: true,
  reminder1hEnabled: true,
  template7dWhatsapp:
    'Hola {patient_name}, te recordamos tu cita con el Dr. {doctor_name} el {date} a las {time}.',
  template24hWhatsapp:
    'Hola {patient_name}, mañana tienes cita con el Dr. {doctor_name} a las {time}.',
  template3hWhatsapp: 'Hola {patient_name}, en 3 horas tienes cita con el Dr. {doctor_name}.',
  quietHoursStart: '21:00:00',
  quietHoursEnd: '08:00:00',
} as const;

export interface ReminderSettingsCreateParams {
  id: string;
  doctorId: string;
  enabled: boolean;
  channel: ReminderChannelValue;
  reminder7dEnabled: boolean;
  reminder24hEnabled: boolean;
  reminder3hEnabled: boolean;
  reminder1hEnabled: boolean;
  template7dWhatsapp: string;
  template24hWhatsapp: string;
  template3hWhatsapp: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ReminderSettings domain entity.
 *
 * Represents a doctor's reminder configuration (one row per doctor — UNIQUE).
 *
 * Invariants:
 *   - isOwnedBy() enforces doctor ownership — used for anti-IDOR checks.
 *   - withUpdates() returns a NEW entity (immutable pattern — never mutates in place).
 *
 * No imports from NestJS, Sequelize, or any external library.
 */
export class ReminderSettings {
  readonly id: string;
  readonly doctorId: string;
  readonly enabled: boolean;
  readonly channel: ReminderChannelValue;
  readonly reminder7dEnabled: boolean;
  readonly reminder24hEnabled: boolean;
  readonly reminder3hEnabled: boolean;
  readonly reminder1hEnabled: boolean;
  readonly template7dWhatsapp: string;
  readonly template24hWhatsapp: string;
  readonly template3hWhatsapp: string;
  readonly quietHoursStart: string;
  readonly quietHoursEnd: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: ReminderSettingsCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.enabled = params.enabled;
    this.channel = params.channel;
    this.reminder7dEnabled = params.reminder7dEnabled;
    this.reminder24hEnabled = params.reminder24hEnabled;
    this.reminder3hEnabled = params.reminder3hEnabled;
    this.reminder1hEnabled = params.reminder1hEnabled;
    this.template7dWhatsapp = params.template7dWhatsapp;
    this.template24hWhatsapp = params.template24hWhatsapp;
    this.template3hWhatsapp = params.template3hWhatsapp;
    this.quietHoursStart = params.quietHoursStart;
    this.quietHoursEnd = params.quietHoursEnd;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /** Returns true when the given doctorId owns this settings record. Anti-IDOR guard. */
  isOwnedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /** Returns a NEW ReminderSettings with applied partial updates (immutable pattern). */
  withUpdates(
    patch: Partial<Omit<ReminderSettingsCreateParams, 'id' | 'doctorId' | 'createdAt'>>,
  ): ReminderSettings {
    return ReminderSettings.create({
      id: this.id,
      doctorId: this.doctorId,
      enabled: patch.enabled ?? this.enabled,
      channel: patch.channel ?? this.channel,
      reminder7dEnabled: patch.reminder7dEnabled ?? this.reminder7dEnabled,
      reminder24hEnabled: patch.reminder24hEnabled ?? this.reminder24hEnabled,
      reminder3hEnabled: patch.reminder3hEnabled ?? this.reminder3hEnabled,
      reminder1hEnabled: patch.reminder1hEnabled ?? this.reminder1hEnabled,
      template7dWhatsapp: patch.template7dWhatsapp ?? this.template7dWhatsapp,
      template24hWhatsapp: patch.template24hWhatsapp ?? this.template24hWhatsapp,
      template3hWhatsapp: patch.template3hWhatsapp ?? this.template3hWhatsapp,
      quietHoursStart: patch.quietHoursStart ?? this.quietHoursStart,
      quietHoursEnd: patch.quietHoursEnd ?? this.quietHoursEnd,
      createdAt: this.createdAt,
      updatedAt: patch.updatedAt ?? new Date(),
    });
  }

  /** Factory — creates a ReminderSettings from raw params. Does not persist. */
  static create(params: ReminderSettingsCreateParams): ReminderSettings {
    return new ReminderSettings(params);
  }

  /**
   * Returns a virtual (in-memory) ReminderSettings with all defaults applied.
   * Used when a doctor has no stored settings — returned as-is from the GET endpoint.
   * The id is empty string to signal it is not persisted.
   */
  static defaults(doctorId: string): ReminderSettings {
    const now = new Date(0); // epoch sentinel — never persisted
    return ReminderSettings.create({
      id: '',
      doctorId,
      ...REMINDERS_SETTINGS_DEFAULTS,
      createdAt: now,
      updatedAt: now,
    });
  }
}
