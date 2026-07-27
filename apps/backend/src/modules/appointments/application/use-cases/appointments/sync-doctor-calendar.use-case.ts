import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../domain/repositories/appointment.repository';
import {
  OFFICE_REPOSITORY,
  type IOfficeRepository,
} from '../../../../offices/domain/repositories/office.repository';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { GetIntegrationStatusUseCase } from '../../../../integrations/application/use-cases/integrations/get-integration-status.use-case';
import { CreateCalendarEventUseCase } from '../../../../integrations/application/use-cases/integrations/create-calendar-event.use-case';
import { CalendarNotConnectedError } from '../../../domain/errors/calendar-not-connected.error';

export interface SyncDoctorCalendarResult {
  total: number;
  synced: number;
  failed: number;
}

/**
 * SyncDoctorCalendarUseCase — calendar backfill for a doctor.
 *
 * Creates Google Calendar events for upcoming appointments that have no
 * google_calendar_event_id yet (presenciales históricas, citas creadas antes
 * de conectar Google, o citas con Jitsi fallback).
 *
 * DELIBERATE: attendeeEmail is NOT passed — the backfill creates events only
 * in the doctor's calendar to avoid sending Google invitations to patients
 * for old appointments.
 *
 * DELIBERATE: no emails nor .ics are sent — backfill is silent on the patient side.
 *
 * Processing is sequential (not parallel) to avoid Google Calendar API rate limits.
 *
 * SECURITY: no PII (patient name, email, cedula) is ever logged.
 */
@Injectable()
export class SyncDoctorCalendarUseCase {
  private readonly logger = new Logger(SyncDoctorCalendarUseCase.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    private readonly getIntegrationStatus: GetIntegrationStatusUseCase,
    private readonly createCalendarEvent: CreateCalendarEventUseCase,
  ) {}

  async execute(doctorId: string): Promise<SyncDoctorCalendarResult> {
    // 1. Guard: doctor must have Google Calendar connected.
    const status = await this.getIntegrationStatus.execute(doctorId);
    if (!status.connected) {
      throw new CalendarNotConnectedError();
    }

    // 2. Resolve the doctor's display name once — avoids one DB hit per appointment.
    const profile = await this.doctorProfileRepo.findByDoctorId(doctorId);
    const doctorName = profile?.fullName ?? 'Especialista';

    // 3. Fetch upcoming appointments without a Google Calendar event (up to 100).
    const appointments = await this.appointmentRepo.findUpcomingWithoutCalendarEvent(
      doctorId,
      new Date(),
      100,
    );

    const total = appointments.length;
    let synced = 0;
    let failed = 0;

    // 4. Process sequentially to respect Google Calendar API rate limits.
    for (const appointment of appointments) {
      try {
        const durationMinutes = appointment.durationMinutes ?? 30;
        const endISO = new Date(
          appointment.scheduledAt.getTime() + durationMinutes * 60 * 1000,
        ).toISOString();

        // Resolve office location when the appointment has an officeId.
        // Scoped by doctorId (defence in depth): the appointment is already
        // owner-scoped, but every office lookup in this codebase goes through
        // findByIdForDoctor. An unresolved office only costs the location field.
        let location: string | undefined;
        if (appointment.officeId) {
          const office = await this.officeRepo.findByIdForDoctor(appointment.officeId, doctorId);
          if (office) {
            location = office.address || office.name;
          }
        }

        const withMeet = appointment.appointmentMode === 'online';

        // DELIBERATE: no attendeeEmail — backfill must not send Google invitations
        // to patients for past or existing appointments.
        const result = await this.createCalendarEvent.execute({
          doctorId,
          summary: `Cita médica — ${doctorName}`,
          // Do not include patient name or any PII in the description.
          description: `Cita registrada en Delta Salud — ID: ${appointment.id}`,
          startISO: appointment.scheduledAt.toISOString(),
          endISO,
          withMeet,
          location,
        });

        const eventId = result.eventId || null;
        if (eventId) {
          await this.appointmentRepo.updateGoogleEventId(appointment.id, eventId);

          // For online appointments where a Meet link was returned and the
          // appointment did not have one yet, persist it too.
          if (withMeet && result.meetLink && !appointment.meetLink) {
            await this.appointmentRepo.updateMeetLink(appointment.id, result.meetLink);
          }

          synced++;
          this.logger.debug(`[calendar-sync] synced appointment ${appointment.id}`);
        } else {
          failed++;
          this.logger.warn(
            `[calendar-sync] appointment ${appointment.id} returned no eventId — skipping persist`,
          );
        }
      } catch (err) {
        failed++;
        // Log without PII — never include patient name, email, cedula, or diagnosis.
        this.logger.warn(
          `[calendar-sync] failed to sync appointment ${appointment.id}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { total, synced, failed };
  }
}
