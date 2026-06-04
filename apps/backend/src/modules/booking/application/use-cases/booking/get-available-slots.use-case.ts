import { Inject, Injectable } from '@nestjs/common';
import {
  DoctorSchedule,
  type TimeSlot,
} from '../../../../doctor-settings/domain/value-objects/doctor-schedule.vo';
import {
  DOCTOR_SCHEDULE_REPOSITORY,
  type IDoctorScheduleRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-schedule.repository';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../../appointments/domain/repositories/appointment.repository';
import { DoctorNotFoundError } from './create-booking.use-case';
import {
  BOOKING_DOCTOR_LOADER,
  type IBookingDoctorLoader,
} from '../../../domain/repositories/booking-doctor.repository';

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
 * Returns the list of theoretical slots for a doctor on a given date, with each
 * slot marked as available or occupied by an active appointment.
 *
 * Anti-enumeration: throws DoctorNotFoundError (→ 404) when the doctor does not
 * exist or is inactive — same behaviour as GetBookingDoctorInfoUseCase so that
 * a caller cannot distinguish between "bad doctor ID" and "doctor has no slots".
 */
@Injectable()
export class GetAvailableSlotsUseCase {
  constructor(
    @Inject(BOOKING_DOCTOR_LOADER)
    private readonly doctorLoader: IBookingDoctorLoader,
    @Inject(DOCTOR_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IDoctorScheduleRepository,
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
  ) {}

  async execute(doctorId: string, dateStr: string): Promise<DoctorSlotsResult> {
    // 1. Anti-enumeration guard — 404 if doctor not found / inactive
    const doctor = await this.doctorLoader.findById(doctorId);
    if (!doctor || !doctor.isActive) {
      throw new DoctorNotFoundError();
    }

    // 2. Parse the requested date (YYYY-MM-DD) into a local Date object.
    //    We treat the date as a calendar date in UTC midnight to keep things
    //    deterministic and timezone-agnostic at this layer.
    const date = new Date(`${dateStr}T00:00:00.000Z`);

    // 3. Load the doctor's schedule configuration; fall back to DEFAULT_SCHEDULE
    const scheduleParams = await this.scheduleRepo.findByDoctorId(doctorId);
    const schedule = scheduleParams
      ? DoctorSchedule.create(scheduleParams)
      : DoctorSchedule.default();

    // 4. Generate theoretical slots for the day
    const theoretical: TimeSlot[] = schedule.generateSlotsForDate(date);

    if (theoretical.length === 0) {
      return { date: dateStr, slots: [] };
    }

    // 5. Fetch active appointments for the doctor on this day
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

    // 6. Map theoretical slots to AvailableSlot[]
    const slots: AvailableSlot[] = theoretical.map((s) => ({
      time: s.start,
      available: !occupiedTimes.has(s.start),
    }));

    return { date: dateStr, slots };
  }

  /** Formats a Date as "HH:MM" in UTC (our canonical representation). */
  private toHHMM(d: Date): string {
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}
