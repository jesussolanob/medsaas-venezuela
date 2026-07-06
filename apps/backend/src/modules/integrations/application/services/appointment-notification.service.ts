import { Injectable, Logger, Optional } from '@nestjs/common';
import { CreateCalendarEventUseCase } from '../use-cases/integrations/create-calendar-event.use-case';
import { GoogleNotConnectedError } from '../../domain/errors/google-not-connected.error';
import { generateIcsEvent } from '../../infrastructure/ics/ics-generator';
import { MailerService } from '../../../email/application/services/mailer.service';

/**
 * Injection token for AppointmentNotificationService.
 * Used for cross-module injection (e.g. BookingModule) to avoid TypeScript
 * emitting `Object` as the design:paramtype when the type is a class union.
 */
export const APPOINTMENT_NOTIFICATION_SERVICE = 'APPOINTMENT_NOTIFICATION_SERVICE';

export interface AppointmentNotificationInput {
  /** Appointment UUID — used in ICS UID. */
  appointmentId: string;
  doctorId: string;
  /** Doctor full name (for organizer field). */
  doctorName: string;
  /** Doctor email (optional — for organizer field). */
  doctorEmail?: string;
  /**
   * Patient email — optional.
   * When present: patient is added as an attendee on the Google Calendar event
   * and receives an .ics invitation by email.
   * When absent: the doctor's event and Meet link are created as usual, but no
   * attendee is added to the Google event and no email is sent to the patient.
   */
  patientEmail?: string;
  patientName: string;
  scheduledAtISO: string;
  /** Duration in minutes. Used to compute end time. */
  durationMinutes: number;
  /** 'online' | 'in_person' */
  appointmentMode: string;
  /** Office physical address (for in-person). */
  officeAddress?: string;
  /** Office name. */
  officeName?: string;
}

export interface AppointmentNotificationResult {
  /** Meet link (Google Meet or Jitsi) for online appointments; null for in-person. */
  meetLink: string | null;
  /**
   * Google Calendar event ID when the meet link was created via Google Calendar API.
   * Null when the appointment is in-person, when Google is not connected, or when
   * the Jitsi fallback was used.
   */
  googleCalendarEventId: string | null;
  /** How the notification was delivered. */
  channel: 'google_meet' | 'jitsi_fallback' | 'in_person';
}

/**
 * AppointmentNotificationService
 *
 * Orchestrates the notification + calendar invite flow for a new appointment:
 *
 *   ONLINE:
 *     1. Try CreateCalendarEventUseCase → Google Meet link.
 *        If GoogleNotConnectedError → fallback Jitsi link.
 *     2. Generate .ics with the chosen link.
 *     3. Send confirmation email with .ics attachment note.
 *
 *   IN_PERSON:
 *     1. No meet link.
 *     2. Generate .ics with office address.
 *     3. Send confirmation email with office address.
 *
 * RESILIENCE: if email or ICS generation fails, it is logged but does NOT
 * propagate — the appointment is already saved; notification is best-effort.
 *
 * SECURITY: no PII logged. "patientEmail" and "doctorEmail" never appear in logs.
 */
@Injectable()
export class AppointmentNotificationService {
  private readonly logger = new Logger(AppointmentNotificationService.name);

  constructor(
    private readonly createCalendarEvent: CreateCalendarEventUseCase,
    /**
     * MailerService is optional to preserve backward compatibility with test
     * contexts that do not wire up the EmailModule.
     */
    @Optional()
    private readonly mailer: MailerService | null = null,
  ) {}

  async notify(input: AppointmentNotificationInput): Promise<AppointmentNotificationResult> {
    const endISO = this.computeEndISO(input.scheduledAtISO, input.durationMinutes);

    if (input.appointmentMode === 'online') {
      return this.handleOnline(input, endISO);
    }

    return this.handleInPerson(input, endISO);
  }

  // ---------------------------------------------------------------------------
  // Private handlers
  // ---------------------------------------------------------------------------

  private async handleOnline(
    input: AppointmentNotificationInput,
    endISO: string,
  ): Promise<AppointmentNotificationResult> {
    let meetLink: string;
    let googleCalendarEventId: string | null = null;
    let channel: AppointmentNotificationResult['channel'];

    try {
      const result = await this.createCalendarEvent.execute({
        doctorId: input.doctorId,
        summary: `Cita médica — ${input.doctorName}`,
        // Do not include patient name or any PII in the description.
        description: `Cita registrada en Delta Medical — ID: ${input.appointmentId}`,
        startISO: input.scheduledAtISO,
        endISO,
        // Only add the patient as an attendee when their email is known.
        // Omitting the field prevents Google from rejecting an empty attendee.
        attendeeEmail: input.patientEmail,
      });
      meetLink = result.meetLink;
      // Capture the event ID only when it is a non-empty string
      googleCalendarEventId = result.eventId || null;
      channel = 'google_meet';
    } catch (err) {
      if (err instanceof GoogleNotConnectedError) {
        // Fallback: generate a Jitsi link deterministically from appointmentId
        meetLink = `https://meet.jit.si/delta-${input.appointmentId}`;
        channel = 'jitsi_fallback';
        this.logger.log('[notify] Google not connected — using Jitsi fallback');
      } else {
        // Unexpected error — still use Jitsi fallback
        meetLink = `https://meet.jit.si/delta-${input.appointmentId}`;
        channel = 'jitsi_fallback';
        this.logger.warn('[notify] unexpected Google Calendar error — using Jitsi fallback');
      }
    }

    await this.sendNotification(input, {
      endISO,
      meetLink,
      channel,
    });

    return { meetLink, googleCalendarEventId, channel };
  }

  private async handleInPerson(
    input: AppointmentNotificationInput,
    endISO: string,
  ): Promise<AppointmentNotificationResult> {
    await this.sendNotification(input, {
      endISO,
      meetLink: null,
      channel: 'in_person',
    });
    return { meetLink: null, googleCalendarEventId: null, channel: 'in_person' };
  }

  private async sendNotification(
    input: AppointmentNotificationInput,
    extra: {
      endISO: string;
      meetLink: string | null;
      channel: AppointmentNotificationResult['channel'];
    },
  ): Promise<void> {
    // When the patient has no email on file, skip the ICS generation and email
    // delivery entirely. The doctor's calendar event / Meet link is already
    // created by this point — no action needed on the patient side.
    if (!input.patientEmail) {
      this.logger.debug(
        `[notify] no patient email for appointment ${input.appointmentId} — skipping patient invite`,
      );
      return;
    }

    try {
      const icsContent = generateIcsEvent({
        appointmentId: input.appointmentId,
        summary: `Cita médica — ${input.doctorName}`,
        startISO: input.scheduledAtISO,
        endISO: extra.endISO,
        organizerName: input.doctorName,
        organizerEmail: input.doctorEmail,
        attendeeEmail: input.patientEmail,
        officeAddress: input.officeAddress,
        meetLink: extra.meetLink ?? undefined,
        description: input.officeName ? `Consultorio: ${input.officeName}` : undefined,
      });

      if (this.mailer) {
        const templateName =
          extra.channel === 'in_person'
            ? 'appointment_confirmation_inperson'
            : 'appointment_confirmation_online';

        await this.mailer.sendTemplate(
          templateName,
          input.patientEmail,
          {
            patient_name: input.patientName,
            doctor_name: input.doctorName,
            appointment_date: new Date(input.scheduledAtISO).toLocaleDateString('es-VE'),
            appointment_time: new Date(input.scheduledAtISO).toLocaleTimeString('es-VE'),
            meet_link: extra.meetLink ?? '',
            office_address: input.officeAddress ?? '',
            office_name: input.officeName ?? '',
            ics_content: icsContent,
          },
          { type: 'patient', id: null },
        );
      } else {
        this.logger.debug(
          `[notify] MailerService not injected — skipping email for appointment ${input.appointmentId}`,
        );
      }
    } catch (err) {
      // Best-effort: never let notification failures break the booking flow
      this.logger.warn(
        `[notify] notification delivery failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private computeEndISO(startISO: string, durationMinutes: number): string {
    const startMs = new Date(startISO).getTime();
    return new Date(startMs + durationMinutes * 60 * 1000).toISOString();
  }
}
