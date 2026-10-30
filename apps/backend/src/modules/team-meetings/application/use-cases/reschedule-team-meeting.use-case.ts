import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TEAM_MEETING_REPOSITORY,
  type ITeamMeetingRepository,
} from '../../domain/repositories/iteam-meeting.repository';
import {
  AVAILABILITY_BLOCK_REPOSITORY,
  type IAvailabilityBlockRepository,
} from '../../../availability-blocks/domain/repositories/availability-block.repository';
import {
  GOOGLE_INTEGRATION_REPOSITORY,
  type IGoogleIntegrationRepository,
} from '../../../integrations/domain/repositories/google-integration.repository';
import { GoogleCalendarService } from '../../../integrations/infrastructure/google/google-calendar.service';
import { MailerService } from '../../../email/application/services/mailer.service';
import { AvailabilityBlock } from '../../../availability-blocks/domain/entities/availability-block.entity';
import { TeamMeetingNotFoundError } from '../../domain/errors/team-meeting-not-found.error';
import { TeamMeetingAccessDeniedError } from '../../domain/errors/team-meeting-access-denied.error';
import { TeamMeetingTooLateError } from '../../domain/errors/team-meeting-too-late.error';
import { TeamMeetingSlotTakenError } from '../../domain/errors/team-meeting-slot-taken.error';
import { randomUUID } from 'crypto';
import { CARACAS_OFFSET } from '../../../../domain/caracas-time';

export interface RescheduleTeamMeetingInput {
  meetingId: string;
  actorId: string;
  /** YYYY-MM-DD in Caracas timezone */
  date: string;
  /** HH:MM in Caracas timezone */
  time: string;
}

export interface RescheduleTeamMeetingOutput {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  meetingUrl: string | null;
}

const MEETING_DURATION_MINUTES = 30;
const SLOT_MIN_LEAD_HOURS = 2;

/**
 * RescheduleTeamMeetingUseCase
 *
 * Moves a scheduled team meeting to a new time:
 *   1. Finds the meeting (404 if missing).
 *   2. Validates ownership (anti-IDOR).
 *   3. Validates the 2-hour cutoff.
 *   4. Re-validates the new slot is not blocked.
 *   5. Deletes the old availability block.
 *   6. Creates a new availability block.
 *   7. Patches the Google Calendar event (if present).
 *   8. Updates the meeting row.
 *   9. Sends a reschedule confirmation email.
 */
@Injectable()
export class RescheduleTeamMeetingUseCase {
  private readonly logger = new Logger(RescheduleTeamMeetingUseCase.name);

  constructor(
    @Inject(TEAM_MEETING_REPOSITORY)
    private readonly repo: ITeamMeetingRepository,
    @Inject(AVAILABILITY_BLOCK_REPOSITORY)
    private readonly blockRepo: IAvailabilityBlockRepository,
    @Inject(GOOGLE_INTEGRATION_REPOSITORY)
    private readonly googleIntegrationRepo: IGoogleIntegrationRepository,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly mailer: MailerService,
  ) {}

  async execute(input: RescheduleTeamMeetingInput): Promise<RescheduleTeamMeetingOutput> {
    const now = new Date();

    // 1. Find the meeting
    const meeting = await this.repo.findById(input.meetingId);
    if (!meeting) throw new TeamMeetingNotFoundError();

    // 2. Ownership check (anti-IDOR — doctor can only reschedule their own meeting)
    if (!meeting.isOwnedBy(input.actorId)) {
      throw new TeamMeetingAccessDeniedError();
    }

    // 3. 2-hour cutoff
    if (!meeting.isModifiable(now)) {
      throw new TeamMeetingTooLateError();
    }

    // 4. Parse new slot time
    const newStartsAt = new Date(`${input.date}T${input.time}:00.000${CARACAS_OFFSET}`);
    const newEndsAt = new Date(newStartsAt.getTime() + MEETING_DURATION_MINUTES * 60 * 1000);

    // Validate ≥ now + 2h
    const minStart = now.getTime() + SLOT_MIN_LEAD_HOURS * 60 * 60 * 1000;
    if (newStartsAt.getTime() < minStart) {
      throw new TeamMeetingSlotTakenError();
    }

    // Validate slot is free (excluding the old block itself)
    const [appointments, blocks] = await Promise.all([
      this.repo.getAppointmentsInRange(meeting.doctorId, newStartsAt, newEndsAt),
      this.repo.getAvailabilityBlocksInRange(meeting.doctorId, newStartsAt, newEndsAt),
    ]);
    // Appointments always conflict.
    if (appointments.length > 0) {
      throw new TeamMeetingSlotTakenError();
    }
    // Availability blocks conflict unless the new time equals the old time
    // (doctor is re-confirming the same slot, which is allowed).
    if (
      blocks.length > 0 &&
      !(
        newStartsAt.getTime() === meeting.startsAt.getTime() &&
        newEndsAt.getTime() === meeting.endsAt.getTime()
      )
    ) {
      throw new TeamMeetingSlotTakenError();
    }

    // 5. Delete old availability block
    if (meeting.availabilityBlockId) {
      try {
        await this.blockRepo.delete(meeting.availabilityBlockId);
      } catch {
        this.logger.warn('[team-meetings] failed to delete old availability block');
      }
    }

    // 6. Create new availability block
    const newBlockId = randomUUID();
    const newBlock = AvailabilityBlock.create({
      id: newBlockId,
      doctorId: meeting.doctorId,
      startsAt: newStartsAt,
      endsAt: newEndsAt,
      reason: 'Reunión de equipo Delta',
      createdAt: now,
      updatedAt: now,
    });
    await this.blockRepo.create(newBlock);

    // 7. Patch Google Calendar event (best-effort)
    if (meeting.externalEventId && this.googleCalendar.isConfigured()) {
      const settings = await this.repo.getSettings(['team_meeting_host_profile_id']);
      const hostProfileId =
        settings.find((s) => s.key === 'team_meeting_host_profile_id')?.value ?? '';
      if (hostProfileId) {
        const integration = await this.googleIntegrationRepo.findByDoctorId(hostProfileId);
        if (integration) {
          let activeIntegration = integration;
          if (integration.isTokenExpired()) {
            try {
              const refreshed = await this.googleCalendar.refreshAccessToken(
                integration.refreshToken,
              );
              await this.googleIntegrationRepo.updateTokens({
                doctorId: hostProfileId,
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken ?? integration.refreshToken,
                tokenExpiry: refreshed.tokenExpiry,
              });
              activeIntegration = integration.withRefreshedTokens(
                refreshed.accessToken,
                refreshed.refreshToken ?? integration.refreshToken,
                refreshed.tokenExpiry,
              );
            } catch {
              this.logger.warn(
                '[team-meetings] host token refresh failed — skipping calendar patch',
              );
            }
          }
          try {
            await this.googleCalendar.updateEventTime(
              activeIntegration.accessToken,
              meeting.externalEventId,
              newStartsAt.toISOString(),
              newEndsAt.toISOString(),
            );
          } catch (err: unknown) {
            this.logger.warn(
              '[team-meetings] Google Calendar event update failed: ' +
                (err instanceof Error ? err.message : String(err)),
            );
          }
        }
      }
    }

    // 8. Update the meeting row
    const updated = await this.repo.update(meeting.id, {
      startsAt: newStartsAt,
      endsAt: newEndsAt,
      availabilityBlockId: newBlockId,
    });

    // 9. Send reschedule email (best-effort)
    const doctorProfile = await this.repo.getDoctorProfile(meeting.doctorId);
    if (doctorProfile?.email) {
      const startsAtText = this.formatCaracasTime(newStartsAt);
      void this.mailer
        .sendTemplate(
          'team_meeting_rescheduled',
          doctorProfile.email,
          {
            doctorName: doctorProfile.name ?? 'Especialista',
            startsAtText,
            meetingUrl: updated.meetingUrl ?? 'N/D',
            manageUrl: `${process.env['FRONTEND_URL'] ?? 'https://app.deltasalud.app'}/doctor/perfil`,
          },
          { type: 'doctor', id: meeting.doctorId },
        )
        .catch((err: unknown) => {
          this.logger.warn(
            '[team-meetings] failed to send reschedule email: ' +
              (err instanceof Error ? err.message : String(err)),
          );
        });
    }

    return {
      id: updated.id,
      startsAt: updated.startsAt,
      endsAt: updated.endsAt,
      status: updated.status,
      meetingUrl: updated.meetingUrl,
    };
  }

  private formatCaracasTime(date: Date): string {
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }
}
