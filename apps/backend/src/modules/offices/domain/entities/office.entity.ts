import type { DayScheduleParams } from '../value-objects/day-schedule.vo';

/** Modality options for a doctor office. */
export type OfficeModality = 'in_person' | 'online' | 'both';

export interface OfficeCreateParams {
  id: string;
  doctorId: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  schedule: DayScheduleParams[];
  slotDuration: number; // minutes
  bufferMinutes: number;
  isActive: boolean;
  /** Modality of appointments allowed for this office. Default: 'in_person'. */
  modality: OfficeModality;
  /** Optional Google Maps or http/https URL for the physical office location. Defaults to null. */
  mapUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Office domain entity.
 *
 * Represents a doctor's physical consultation office with its weekly schedule
 * and booking configuration.
 *
 * Invariants:
 *   - isOwnedBy() enforces doctor ownership — used for anti-IDOR checks.
 *   - isScheduledOnDay() checks whether the office has an enabled schedule entry
 *     for a given weekday (0=Monday … 6=Sunday — offices schema, NOT JS getDay()).
 *
 * No imports from NestJS, Sequelize, or any external library.
 */
export class Office {
  readonly id: string;
  readonly doctorId: string;
  readonly name: string;
  readonly address: string;
  readonly city: string;
  readonly phone: string;
  readonly schedule: DayScheduleParams[];
  readonly slotDuration: number;
  readonly bufferMinutes: number;
  readonly isActive: boolean;
  readonly modality: OfficeModality;
  /** Optional map URL (http/https) for the office location. Null when not set. */
  readonly mapUrl: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: OfficeCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.name = params.name;
    this.address = params.address;
    this.city = params.city;
    this.phone = params.phone;
    this.schedule = params.schedule;
    this.slotDuration = params.slotDuration;
    this.bufferMinutes = params.bufferMinutes;
    this.isActive = params.isActive;
    this.modality = params.modality ?? 'in_person';
    this.mapUrl = params.mapUrl ?? null;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /**
   * Returns true when the requested appointment modality is compatible with
   * this office's configured modality.
   *
   *   in_person office → accepts 'in_person' or 'presencial' (API alias)
   *   online office    → only 'online' allowed
   *   both office      → any modality allowed
   *
   * NOTE: AppointmentModeSchema uses 'presencial' | 'online' while Office
   * persists 'in_person' | 'online' | 'both'. We normalise here so both
   * vocabularies compare correctly.
   */
  supportsModality(requested: string): boolean {
    if (this.modality === 'both') return true;
    // Normalise Spanish alias to internal value
    const normalised = requested === 'presencial' ? 'in_person' : requested;
    return this.modality === normalised;
  }

  /** Returns true when the given doctorId owns this office. Anti-IDOR guard. */
  isOwnedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /**
   * Returns ALL enabled DaySchedule entries for the given weekday (0=Mon … 6=Sun).
   * Supports multiple time blocks per day (e.g., morning + afternoon).
   * Returns an empty array when no enabled entries exist for that day.
   */
  getEnabledSchedulesForDay(day: number): DayScheduleParams[] {
    return this.schedule.filter((s) => s.day === day && s.enabled);
  }

  /**
   * Returns the first enabled DaySchedule entry for the given weekday, or null.
   * @deprecated Use getEnabledSchedulesForDay() to support multiple blocks per day.
   */
  getEnabledScheduleForDay(day: number): DayScheduleParams | null {
    const entries = this.getEnabledSchedulesForDay(day);
    return entries[0] ?? null;
  }

  /**
   * Returns a new Office with isActive toggled (immutable pattern).
   */
  toggleActive(): Office {
    return Office.create({ ...this.toParams(), isActive: !this.isActive, updatedAt: new Date() });
  }

  /** Factory — creates an Office from raw params. Does not persist. */
  static create(params: OfficeCreateParams): Office {
    return new Office(params);
  }

  private toParams(): OfficeCreateParams {
    return {
      id: this.id,
      doctorId: this.doctorId,
      name: this.name,
      address: this.address,
      city: this.city,
      phone: this.phone,
      schedule: this.schedule,
      slotDuration: this.slotDuration,
      bufferMinutes: this.bufferMinutes,
      isActive: this.isActive,
      modality: this.modality,
      mapUrl: this.mapUrl,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
