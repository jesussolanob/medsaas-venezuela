import { Inject, Injectable } from '@nestjs/common';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../../appointments/domain/repositories/appointment.repository';

export interface ImmediateWindowResult {
  /** The server-side "now" used for all calculations (UTC Date). */
  now: Date;
  /**
   * The scheduledAt of the next active appointment on the doctor's calendar, or
   * null when there are no upcoming appointments within the next 24 hours.
   */
  nextAppointmentAt: Date | null;
  /**
   * Minutes between now and the next appointment.
   * When nextAppointmentAt is null, equals durationMinutes (the full service length).
   */
  availableMinutes: number;
  /**
   * The duration the immediate appointment will actually use:
   *   min(durationMinutes, availableMinutes)
   * In force mode the caller overrides this to durationMinutes unconditionally.
   */
  effectiveDuration: number;
  /**
   * True when the full service duration fits before the next appointment (or when
   * there is no next appointment).
   */
  fits: boolean;
}

/**
 * GetImmediateWindowUseCase
 *
 * Computes how much time is available right now on the doctor's calendar before
 * their next active appointment (within a 24-hour look-ahead window).
 *
 * Used by both:
 *   - GET  /api/doctor/appointments/immediate-window  (informational display)
 *   - POST /api/doctor/appointments/immediate          (before creating the appt)
 *
 * Security note: doctorId MUST come from the authenticated user (CurrentUser.sub),
 * never from the query/body. This is enforced in the controller.
 */
@Injectable()
export class GetImmediateWindowUseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
  ) {}

  async execute(input: {
    doctorId: string;
    durationMinutes: number;
  }): Promise<ImmediateWindowResult> {
    const now = new Date();
    // Look 24 hours ahead — far enough to capture any appointment that would
    // conflict, without loading the entire future calendar.
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const upcoming = await this.appointmentRepo.findActiveByDoctorAndDateRange(
      input.doctorId,
      now,
      horizon,
    );

    // Sort ascending and pick the nearest appointment.
    upcoming.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    const nextAppt = upcoming[0] ?? null;

    let availableMinutes: number;
    let nextAppointmentAt: Date | null = null;

    if (nextAppt) {
      nextAppointmentAt = nextAppt.scheduledAt;
      // Floor to whole minutes to avoid fractional display.
      availableMinutes = Math.floor((nextAppt.scheduledAt.getTime() - now.getTime()) / 60_000);
      // Guard against clock drift producing a negative value.
      if (availableMinutes < 0) availableMinutes = 0;
    } else {
      // No upcoming appointment — the full service duration is available.
      availableMinutes = input.durationMinutes;
    }

    const effectiveDuration = Math.min(input.durationMinutes, availableMinutes);
    const fits = availableMinutes >= input.durationMinutes;

    return {
      now,
      nextAppointmentAt,
      availableMinutes,
      effectiveDuration,
      fits,
    };
  }
}
