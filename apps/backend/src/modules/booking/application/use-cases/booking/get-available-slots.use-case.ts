import { Inject, Injectable } from '@nestjs/common';
import type { IOfficeRepository } from '../../../../offices/domain/repositories/office.repository';
import { OFFICE_REPOSITORY } from '../../../../offices/domain/repositories/office.repository';
import { formatMinutes } from '../../../../offices/domain/value-objects/day-schedule.vo';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../../appointments/domain/repositories/appointment.repository';
import { DoctorNotFoundError } from './create-booking.use-case';
import {
  BOOKING_DOCTOR_LOADER,
  type IBookingDoctorLoader,
} from '../../../domain/repositories/booking-doctor.repository';
import {
  AVAILABILITY_BLOCK_REPOSITORY,
  type IAvailabilityBlockRepository,
} from '../../../../availability-blocks/domain/repositories/availability-block.repository';
import {
  DOCTOR_SCHEDULE_REPOSITORY,
  type IDoctorScheduleRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-schedule.repository';

export interface AvailableSlot {
  time: string; // HH:MM
  available: boolean;
}

export interface DoctorSlotsResult {
  date: string; // YYYY-MM-DD (echo of the requested date)
  slots: AvailableSlot[];
}

/**
 * GetAvailableSlotsUseCase
 *
 * Generates time slots for a doctor on a given date from the doctor's ACTIVE
 * offices (doctor_offices table), replacing the legacy doctor_schedules approach.
 *
 * Weekday mapping:
 *   JS Date.getUTCDay(): 0=Sunday, 1=Monday … 6=Saturday
 *   Offices schema: day 0=Monday … 6=Sunday
 *   Conversion: officeDay = (getUTCDay() + 6) % 7
 *
 * Per active office that has the day enabled:
 *   Slots are generated from start → end advancing (slot_duration + buffer_minutes).
 *   NOTE: buffer_minutes is a gap between bookings — it is NOT part of the slot's
 *   displayed time, but it advances the next slot start position.
 *
 * All offices' slots are unioned and deduplicated by HH:MM, then sorted ascending.
 *
 * Anti-enumeration: throws DoctorNotFoundError (→ 404) when the doctor does not
 * exist or is inactive, identical to GetBookingDoctorInfoUseCase behaviour.
 *
 * Horizon check: dates beyond now + booking_horizon_weeks return empty slots.
 * Dates before today (UTC) return empty slots.
 *
 * Block filtering: slots that fall within any doctor_availability_blocks range
 * are marked unavailable.
 */
@Injectable()
export class GetAvailableSlotsUseCase {
  constructor(
    @Inject(BOOKING_DOCTOR_LOADER)
    private readonly doctorLoader: IBookingDoctorLoader,
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(AVAILABILITY_BLOCK_REPOSITORY)
    private readonly blockRepo: IAvailabilityBlockRepository,
    @Inject(DOCTOR_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IDoctorScheduleRepository,
  ) {}

  async execute(doctorId: string, dateStr: string): Promise<DoctorSlotsResult> {
    // 1. Anti-enumeration guard — 404 if doctor not found / inactive
    const doctor = await this.doctorLoader.findById(doctorId);
    if (!doctor || !doctor.isActive) {
      throw new DoctorNotFoundError();
    }

    // 2. Load booking horizon for this doctor (default 8 weeks)
    const schedule = await this.scheduleRepo.findByDoctorId(doctorId);
    const horizonWeeks = schedule?.bookingHorizonWeeks ?? 8;

    // 3. Horizon check — date must be today or later, and within the horizon window
    const requestedDate = new Date(`${dateStr}T00:00:00.000Z`);
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    const horizonEnd = new Date(todayUtc);
    horizonEnd.setUTCDate(horizonEnd.getUTCDate() + horizonWeeks * 7);

    if (requestedDate < todayUtc || requestedDate >= horizonEnd) {
      return { date: dateStr, slots: [] };
    }

    // 4. Convert the requested date to the offices weekday scheme.
    //    new Date('YYYY-MMT00:00:00Z').getUTCDay() → 0=Sunday
    //    (getUTCDay() + 6) % 7 → 0=Monday … 6=Sunday
    const jsDay = requestedDate.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
    const officeDay = (jsDay + 6) % 7; // 0=Mon … 6=Sun

    // 5. Load active offices for the doctor
    const activeOffices = await this.officeRepo.findActiveByDoctor(doctorId);

    // 6. Generate theoretical time strings from all active offices that have this day enabled
    const timeSet = new Set<string>();

    for (const office of activeOffices) {
      const dayEntry = office.getEnabledScheduleForDay(officeDay);
      if (!dayEntry) continue;

      const startMin = this.parseMinutes(dayEntry.start);
      const endMin = this.parseMinutes(dayEntry.end);
      const step = office.slotDuration + office.bufferMinutes;

      if (startMin >= endMin || step <= 0) continue;

      let current = startMin;
      while (current + office.slotDuration <= endMin) {
        timeSet.add(formatMinutes(current));
        current += step;
      }
    }

    if (timeSet.size === 0) {
      return { date: dateStr, slots: [] };
    }

    // 7. Fetch active appointments for the doctor on this day
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);
    const occupied = await this.appointmentRepo.findActiveByDoctorAndDateRange(
      doctorId,
      dayStart,
      dayEnd,
    );

    // Build a set of occupied HH:MM strings for O(1) lookup
    const occupiedTimes = new Set<string>(
      occupied.map((appt: { scheduledAt: Date }) => this.toHHMM(appt.scheduledAt)),
    );

    // 8. Load availability blocks overlapping this day
    const blocks = await this.blockRepo.findOverlapping(doctorId, dayStart, dayEnd);

    // 9. Sort times and map to AvailableSlot[]
    const sortedTimes = Array.from(timeSet).sort();
    const slots: AvailableSlot[] = sortedTimes.map((time) => {
      // Convert slot time string to a Date in UTC for block overlap check
      const slotDate = new Date(`${dateStr}T${time}:00.000Z`);
      const blockedByAvailabilityBlock = blocks.some((b) => b.overlapsSlot(slotDate));

      return {
        time,
        available: !occupiedTimes.has(time) && !blockedByAvailabilityBlock,
      };
    });

    return { date: dateStr, slots };
  }

  /** Parse "HH:MM" into total minutes from midnight. */
  private parseMinutes(time: string): number {
    const parts = time.split(':');
    const hStr = parts[0] ?? '0';
    const mStr = parts[1] ?? '0';
    return parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
  }

  /** Formats a Date as "HH:MM" in UTC (canonical representation). */
  private toHHMM(d: Date): string {
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}
