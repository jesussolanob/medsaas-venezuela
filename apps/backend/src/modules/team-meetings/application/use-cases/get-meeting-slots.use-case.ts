import { Inject, Injectable } from '@nestjs/common';
import {
  TEAM_MEETING_REPOSITORY,
  type ITeamMeetingRepository,
  type OfficeScheduleRow,
  type DoctorAppointmentRow,
} from '../../domain/repositories/iteam-meeting.repository';
import { CARACAS_OFFSET } from '../../../../domain/caracas-time';

/** Duration of each team meeting in minutes. */
const MEETING_DURATION_MINUTES = 30;

/** Hours from now before which no slots are offered. */
const SLOT_MIN_LEAD_HOURS = 2;

/**
 * Generic office hours used when the doctor has no active offices configured.
 * Mon–Sat 08:00–18:00 in 30-min steps (America/Caracas).
 * officeDay: 0=Monday … 6=Sunday; Sun (6) is excluded.
 */
const GENERIC_START_MIN = 8 * 60; // 08:00
const GENERIC_END_MIN = 18 * 60; // 18:00

export interface DaySlots {
  date: string; // YYYY-MM-DD in Caracas
  slots: string[]; // HH:MM of available slots
}

export interface GetMeetingSlotsResult {
  usesGenericHours: boolean;
  days: DaySlots[];
}

/**
 * GetMeetingSlotsUseCase
 *
 * Returns available 30-min meeting slots for the next `days` calendar days
 * (default 14) using the doctor's own consultation availability:
 *   - Slots come from active offices (same set as the patient booking widget).
 *   - Only slots ≥ now + 2 h are shown.
 *   - Slots blocked by existing appointments or availability blocks are excluded.
 *   - If the doctor has no active offices → generic Mon–Sat 08:00–18:00 slots.
 *   - The meeting lasts 30 min regardless of the office slot duration.
 */
@Injectable()
export class GetMeetingSlotsUseCase {
  constructor(
    @Inject(TEAM_MEETING_REPOSITORY)
    private readonly repo: ITeamMeetingRepository,
  ) {}

  async execute(doctorId: string, days: number): Promise<GetMeetingSlotsResult> {
    const now = new Date();
    // Earliest allowed slot start (ms)
    const minStartMs = now.getTime() + SLOT_MIN_LEAD_HOURS * 60 * 60 * 1000;

    // Caracas date string for "today"
    const todayCaracasStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    // Load office schedules for the doctor
    const officeSchedules = await this.repo.getActiveOfficeSchedules(doctorId);
    const usesGenericHours = officeSchedules.length === 0;

    // Build a lookup: officeDay → list of {startMin, endMin, slotDuration, bufferMinutes}
    const schedulesByDay = this.buildSchedulesByDay(officeSchedules, usesGenericHours);

    const result: DaySlots[] = [];

    for (let i = 0; i < days; i++) {
      const targetDate = new Date(`${todayCaracasStr}T00:00:00.000${CARACAS_OFFSET}`);
      targetDate.setDate(targetDate.getDate() + i);

      const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Caracas',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(targetDate);

      // officeDay: 0=Monday … 6=Sunday
      const jsDay = targetDate.getUTCDay(); // 0=Sun on this Caracas-midnight UTC instant
      const officeDay = (jsDay + 6) % 7;

      const dayEntries = schedulesByDay.get(officeDay) ?? [];
      if (dayEntries.length === 0) continue;

      // Build all candidate slot times (HH:MM) for this day
      const slotTimes = this.generateSlotTimes(dayEntries);
      if (slotTimes.size === 0) continue;

      // Load appointments and blocks for the whole day
      const dayStart = new Date(`${dateStr}T00:00:00.000${CARACAS_OFFSET}`);
      const dayEnd = new Date(`${dateStr}T23:59:59.999${CARACAS_OFFSET}`);

      const [appointments, blocks] = await Promise.all([
        this.repo.getAppointmentsInRange(doctorId, dayStart, dayEnd),
        this.repo.getAvailabilityBlocksInRange(doctorId, dayStart, dayEnd),
      ]);

      const apptIntervals = this.toApptIntervals(appointments);
      const availableSlots: string[] = [];

      for (const time of Array.from(slotTimes).sort()) {
        // Build the UTC instant for this slot
        const slotUTC = new Date(`${dateStr}T${time}:00.000${CARACAS_OFFSET}`);
        const meetingEndUTC = new Date(slotUTC.getTime() + MEETING_DURATION_MINUTES * 60 * 1000);

        // Filter 1: must be strictly > now + 2h
        if (slotUTC.getTime() <= minStartMs) continue;

        // Filter 2: not blocked by an existing appointment
        const slotStartMin = this.parseMinutes(time);
        const slotEndMin = slotStartMin + MEETING_DURATION_MINUTES;
        const blockedByAppt = apptIntervals.some(
          (a) => slotStartMin < a.endMin && a.startMin < slotEndMin,
        );
        if (blockedByAppt) continue;

        // Filter 3: not covered by an availability block
        const blockedByBlock =
          blocks.some((b) => slotUTC >= b.startsAt && slotUTC < b.endsAt) ||
          blocks.some((b) => slotUTC < b.endsAt && meetingEndUTC > b.startsAt);
        if (blockedByBlock) continue;

        availableSlots.push(time);
      }

      if (availableSlots.length > 0) {
        result.push({ date: dateStr, slots: availableSlots });
      }
    }

    return { usesGenericHours, days: result };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildSchedulesByDay(
    schedules: OfficeScheduleRow[],
    useGeneric: boolean,
  ): Map<number, Array<{ startMin: number; endMin: number }>> {
    const map = new Map<number, Array<{ startMin: number; endMin: number }>>();

    if (useGeneric) {
      // Mon–Sat (officeDay 0–5)
      for (let d = 0; d <= 5; d++) {
        map.set(d, [{ startMin: GENERIC_START_MIN, endMin: GENERIC_END_MIN }]);
      }
      return map;
    }

    for (const s of schedules) {
      const startMin = this.parseMinutes(s.startTime);
      const endMin = this.parseMinutes(s.endTime);
      if (startMin >= endMin) continue;

      const existing = map.get(s.officeDay) ?? [];
      existing.push({ startMin, endMin });
      map.set(s.officeDay, existing);
    }

    return map;
  }

  private generateSlotTimes(entries: Array<{ startMin: number; endMin: number }>): Set<string> {
    const times = new Set<string>();

    for (const entry of entries) {
      let current = entry.startMin;
      while (current + MEETING_DURATION_MINUTES <= entry.endMin) {
        times.add(this.formatMinutes(current));
        current += MEETING_DURATION_MINUTES; // 30-min steps
      }
    }

    return times;
  }

  private toApptIntervals(
    appointments: DoctorAppointmentRow[],
  ): Array<{ startMin: number; endMin: number }> {
    return appointments.map((appt) => {
      const caracasHHMM = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Caracas',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(appt.scheduledAt);

      const startMin = this.parseMinutes(caracasHHMM);
      const dur = appt.durationMinutes ?? 30;
      return { startMin, endMin: startMin + dur };
    });
  }

  private parseMinutes(time: string): number {
    const parts = time.split(':');
    return parseInt(parts[0] ?? '0', 10) * 60 + parseInt(parts[1] ?? '0', 10);
  }

  private formatMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
