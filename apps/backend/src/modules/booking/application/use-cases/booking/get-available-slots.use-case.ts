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
 * Venezuela uses America/Caracas (UTC-04:00 fixed, no DST since 2016).
 * All "wall-clock day" boundaries and HH:MM derivations from stored TIMESTAMPTZ
 * must use this offset so that a 20:00 Caracas slot is never misattributed to
 * the following UTC day.
 */
const CARACAS_OFFSET = '-04:00';

/** Formats a Date as "HH:MM" in America/Caracas local time (wall clock). */
function toHHMMCaracas(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Caracas',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
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
 * Dates before today (America/Caracas) return empty slots.
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

    // 2. Load booking horizon and minimum lead time for this doctor
    const schedule = await this.scheduleRepo.findByDoctorId(doctorId);
    const horizonWeeks = schedule?.bookingHorizonWeeks ?? 8;
    const minLeadDays = schedule?.bookingMinLeadDays ?? 0;

    // 3. Horizon + lead-time check.
    //    Boundaries are expressed as Caracas midnight (offset -04:00) so that the
    //    "current Caracas day" is used for comparison, not the UTC calendar day.
    const requestedDate = new Date(`${dateStr}T00:00:00.000${CARACAS_OFFSET}`);

    // "today" in Caracas: derive the local date string from the current instant,
    // then build a Caracas-midnight instant for apples-to-apples comparison.
    const nowCaracasDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const todayCaracas = new Date(`${nowCaracasDateStr}T00:00:00.000${CARACAS_OFFSET}`);

    const horizonEnd = new Date(todayCaracas);
    horizonEnd.setDate(horizonEnd.getDate() + horizonWeeks * 7);

    // Earliest bookable date = today + minLeadDays.
    // When minLeadDays=0 this equals todayCaracas (same behavior as before).
    const minBookableDate = new Date(todayCaracas);
    minBookableDate.setDate(minBookableDate.getDate() + minLeadDays);

    if (requestedDate < minBookableDate || requestedDate >= horizonEnd) {
      return { date: dateStr, slots: [] };
    }

    // 4. Convert the requested date to the offices weekday scheme.
    //    We use getUTCDay() on the Caracas-midnight instant.  Because the instant is
    //    defined as T00:00:00-04:00 = T04:00:00Z, getUTCDay() always reflects the
    //    correct Caracas calendar day (the UTC day does not roll over until UTC midnight).
    //    (getUTCDay() + 6) % 7 → 0=Monday … 6=Sunday
    const jsDay = requestedDate.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat (Caracas local day)
    const officeDay = (jsDay + 6) % 7; // 0=Mon … 6=Sun

    // 5. Load active offices for the doctor
    const activeOffices = await this.officeRepo.findActiveByDoctor(doctorId);

    // 6. Generate theoretical time strings from all active offices that have this day enabled
    const timeSet = new Set<string>();

    for (const office of activeOffices) {
      const dayEntries = office.getEnabledSchedulesForDay(officeDay);
      if (dayEntries.length === 0) continue;

      const step = office.slotDuration + office.bufferMinutes;
      if (step <= 0) continue;

      for (const dayEntry of dayEntries) {
        const startMin = this.parseMinutes(dayEntry.start);
        const endMin = this.parseMinutes(dayEntry.end);

        if (startMin >= endMin) continue;

        let current = startMin;
        while (current + office.slotDuration <= endMin) {
          timeSet.add(formatMinutes(current));
          current += step;
        }
      }
    }

    if (timeSet.size === 0) {
      return { date: dateStr, slots: [] };
    }

    // 7. Fetch active appointments for the doctor on this day.
    //    dayStart/dayEnd are expressed as Caracas-local midnight and end-of-day so
    //    that a 20:00 Caracas appointment (stored as 00:00 UTC next day) is correctly
    //    captured.  The repo receives proper UTC instants (Date objects).
    const dayStart = new Date(`${dateStr}T00:00:00.000${CARACAS_OFFSET}`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999${CARACAS_OFFSET}`);
    const occupied = await this.appointmentRepo.findActiveByDoctorAndDateRange(
      doctorId,
      dayStart,
      dayEnd,
    );

    // Build a set of occupied HH:MM strings for O(1) lookup.
    // Appointments are stored as UTC TIMESTAMPTZ; convert to Caracas wall-clock
    // time to match the slot HH:MM strings (which are also Caracas wall-clock).
    const occupiedTimes = new Set<string>(
      occupied.map((appt: { scheduledAt: Date }) => toHHMMCaracas(appt.scheduledAt)),
    );

    // 8. Load availability blocks overlapping this day
    const blocks = await this.blockRepo.findOverlapping(doctorId, dayStart, dayEnd);

    // 9. Sort times and map to AvailableSlot[]
    const sortedTimes = Array.from(timeSet).sort();
    const slots: AvailableSlot[] = sortedTimes.map((time) => {
      // Materialize the slot HH:MM as a Caracas-local instant for block overlap check.
      // Block boundaries are also stored as UTC TIMESTAMPTZ, so comparing UTC instants
      // is correct here — we just need the slot instant to reflect Caracas wall clock.
      const slotDate = new Date(`${dateStr}T${time}:00.000${CARACAS_OFFSET}`);
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
}
