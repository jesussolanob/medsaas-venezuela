/**
 * DoctorSchedule value object.
 *
 * Encapsulates the doctor's weekly schedule configuration and
 * generates time slots for a given date.
 *
 * No external imports — pure domain logic.
 */

export interface TimeSlot {
  start: string; // HH:MM
  end: string; // HH:MM
}

export interface DoctorScheduleParams {
  workDays: number[]; // 0=Sunday … 6=Saturday
  startTime: string; // HH:MM (24h)
  endTime: string; // HH:MM (24h)
  slotDurationMinutes: number; // default 30
  breakStart: string | null; // HH:MM or null
  breakEnd: string | null; // HH:MM or null
}

/** Default schedule returned when no schedule is configured: Mon–Fri, 08:00–17:00, 30 min. */
export const DEFAULT_SCHEDULE: DoctorScheduleParams = {
  workDays: [1, 2, 3, 4, 5],
  startTime: '08:00',
  endTime: '17:00',
  slotDurationMinutes: 30,
  breakStart: null,
  breakEnd: null,
};

/** Parse "HH:MM" into total minutes from midnight. */
function parseMinutes(time: string): number {
  const parts = time.split(':');
  const hStr = parts[0] ?? '0';
  const mStr = parts[1] ?? '0';
  return parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
}

/** Format total minutes from midnight as "HH:MM". */
function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export class DoctorSchedule {
  readonly workDays: number[];
  readonly startTime: string;
  readonly endTime: string;
  readonly slotDurationMinutes: number;
  readonly breakStart: string | null;
  readonly breakEnd: string | null;

  constructor(params: DoctorScheduleParams) {
    this.workDays = params.workDays;
    this.startTime = params.startTime;
    this.endTime = params.endTime;
    this.slotDurationMinutes = params.slotDurationMinutes;
    this.breakStart = params.breakStart ?? null;
    this.breakEnd = params.breakEnd ?? null;
  }

  /**
   * Generates available time slots for a given date.
   *
   * Returns an empty array when:
   *   - The date's day-of-week is not in workDays.
   *   - startTime >= endTime (misconfigured schedule).
   *
   * Slots that fully overlap the break window are excluded.
   * Partial overlaps at the boundary are excluded as well —
   * a slot is valid only if its entire interval falls outside [breakStart, breakEnd).
   */
  generateSlotsForDate(date: Date): TimeSlot[] {
    const dayOfWeek = date.getDay(); // 0=Sun … 6=Sat
    if (!this.workDays.includes(dayOfWeek)) {
      return [];
    }

    const startMinutes = parseMinutes(this.startTime);
    const endMinutes = parseMinutes(this.endTime);
    const duration = this.slotDurationMinutes;

    if (startMinutes >= endMinutes || duration <= 0) {
      return [];
    }

    const breakStartMin = this.breakStart !== null ? parseMinutes(this.breakStart) : null;
    const breakEndMin = this.breakEnd !== null ? parseMinutes(this.breakEnd) : null;
    const hasBreak = breakStartMin !== null && breakEndMin !== null && breakStartMin < breakEndMin;

    const slots: TimeSlot[] = [];
    let current = startMinutes;

    while (current + duration <= endMinutes) {
      const slotEnd = current + duration;

      if (hasBreak) {
        // Exclude slot if it overlaps with the break window.
        // A slot overlaps when: slotStart < breakEnd && slotEnd > breakStart
        const overlapsBreak =
          current < (breakEndMin as number) && slotEnd > (breakStartMin as number);
        if (!overlapsBreak) {
          slots.push({ start: formatMinutes(current), end: formatMinutes(slotEnd) });
        }
      } else {
        slots.push({ start: formatMinutes(current), end: formatMinutes(slotEnd) });
      }

      current += duration;
    }

    return slots;
  }

  static create(params: DoctorScheduleParams): DoctorSchedule {
    return new DoctorSchedule(params);
  }

  static default(): DoctorSchedule {
    return new DoctorSchedule(DEFAULT_SCHEDULE);
  }
}
