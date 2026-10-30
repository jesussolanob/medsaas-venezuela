import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  TEAM_MEETING_REPOSITORY,
  type ITeamMeetingRepository,
} from '../../domain/repositories/iteam-meeting.repository';
import {
  AVAILABILITY_BLOCK_REPOSITORY,
  type IAvailabilityBlockRepository,
} from '../../../availability-blocks/domain/repositories/availability-block.repository';
import {
  DOCTOR_PROMPT_REPOSITORY,
  type IDoctorPromptRepository,
} from '../../../doctor-prompts/domain/repositories/idoctor-prompt.repository';
import {
  GOOGLE_INTEGRATION_REPOSITORY,
  type IGoogleIntegrationRepository,
} from '../../../integrations/domain/repositories/google-integration.repository';
import { GoogleCalendarService } from '../../../integrations/infrastructure/google/google-calendar.service';
import { MailerService } from '../../../email/application/services/mailer.service';
import { TeamMeetingAlreadyScheduledError } from '../../domain/errors/team-meeting-already-scheduled.error';
import { TeamMeetingSlotTakenError } from '../../domain/errors/team-meeting-slot-taken.error';
import { AvailabilityBlock } from '../../../availability-blocks/domain/entities/availability-block.entity';
import { MEETING_MODAL_KEY } from '@delta/shared-types';
import { CARACAS_OFFSET } from '../../../../domain/caracas-time';

export interface CreateTeamMeetingInput {
  doctorId: string;
  /** YYYY-MM-DD in Caracas timezone */
  date: string;
  /** HH:MM in Caracas timezone */
  time: string;
  /** 'email' | 'modal' — the source that triggered the booking */
  source: 'email' | 'modal';
}

export interface CreateTeamMeetingOutput {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  meetingUrl: string | null;
  source: string;
}

const MEETING_DURATION_MINUTES = 30;
const SLOT_MIN_LEAD_HOURS = 2;

/**
 * CreateTeamMeetingUseCase
 *
 * Books a 30-min team meeting for the doctor:
 *   1. Validates no existing scheduled meeting (UNIQUE partial index guard).
 *   2. Re-validates the slot is still ≥ now+2h and not double-booked.
 *   3. Looks up the host super_admin's Google integration for a Meet link.
 *   4. Creates an availability block to prevent patient bookings.
 *   5. Creates the Google Calendar event (or falls back to Jitsi).
 *   6. Persists the team meeting.
 *   7. Sends the doctor a confirmation email.
 *   8. Marks the modal prompt as acted (so it stops showing).
 */
@Injectable()
export class CreateTeamMeetingUseCase {
  private readonly logger = new Logger(CreateTeamMeetingUseCase.name);

  constructor(
    @Inject(TEAM_MEETING_REPOSITORY)
    private readonly repo: ITeamMeetingRepository,
    @Inject(AVAILABILITY_BLOCK_REPOSITORY)
    private readonly blockRepo: IAvailabilityBlockRepository,
    @Inject(DOCTOR_PROMPT_REPOSITORY)
    private readonly promptRepo: IDoctorPromptRepository,
    @Inject(GOOGLE_INTEGRATION_REPOSITORY)
    private readonly googleIntegrationRepo: IGoogleIntegrationRepository,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly mailer: MailerService,
  ) {}

  async execute(input: CreateTeamMeetingInput): Promise<CreateTeamMeetingOutput> {
    const now = new Date();

    // 1. Check for existing scheduled meeting
    const existing = await this.repo.findScheduledByDoctor(input.doctorId);
    if (existing) {
      throw new TeamMeetingAlreadyScheduledError();
    }

    // 2. Parse slot time
    const startsAt = new Date(`${input.date}T${input.time}:00.000${CARACAS_OFFSET}`);
    const endsAt = new Date(startsAt.getTime() + MEETING_DURATION_MINUTES * 60 * 1000);

    // Re-validate ≥ now+2h (frontend UI already checks, this is server-side guard)
    const minStart = now.getTime() + SLOT_MIN_LEAD_HOURS * 60 * 60 * 1000;
    if (startsAt.getTime() < minStart) {
      throw new TeamMeetingSlotTakenError();
    }

    // Re-validate slot is not already blocked by an appointment or availability block
    const [appointments, blocks] = await Promise.all([
      this.repo.getAppointmentsInRange(input.doctorId, startsAt, endsAt),
      this.repo.getAvailabilityBlocksInRange(input.doctorId, startsAt, endsAt),
    ]);
    if (appointments.length > 0 || blocks.length > 0) {
      throw new TeamMeetingSlotTakenError();
    }

    // 3. Get doctor profile for email
    const doctorProfile = await this.repo.getDoctorProfile(input.doctorId);

    // 4. Create availability block (prevents patient bookings during the meeting)
    const blockId = randomUUID();
    const block = AvailabilityBlock.create({
      id: blockId,
      doctorId: input.doctorId,
      startsAt,
      endsAt,
      reason: 'Reunión de equipo Delta',
      createdAt: now,
      updatedAt: now,
    });
    await this.blockRepo.create(block);

    // 5. Get host's Google integration (if configured)
    const { meetingUrl, externalEventId } = await this.resolveGoogleMeet(
      startsAt,
      endsAt,
      doctorProfile?.email ?? null,
      doctorProfile?.name ?? null,
    );

    // 6. Persist the meeting
    const meetingId = randomUUID();
    const meeting = await this.repo.create({
      id: meetingId,
      doctorId: input.doctorId,
      startsAt,
      endsAt,
      status: 'scheduled',
      meetingUrl,
      externalEventId,
      availabilityBlockId: blockId,
      source: input.source,
      notes: null,
    });

    // 7. Send confirmation email (best-effort — never fail the booking)
    if (doctorProfile?.email) {
      const startsAtText = this.formatCaracasTime(startsAt);
      void this.mailer
        .sendTemplate(
          'team_meeting_confirmed',
          doctorProfile.email,
          {
            doctorName: doctorProfile.name ?? 'Especialista',
            startsAtText,
            meetingUrl: meetingUrl ?? 'N/D',
            manageUrl: `${process.env['FRONTEND_URL'] ?? 'https://app.deltasalud.app'}/doctor/perfil`,
          },
          { type: 'doctor', id: input.doctorId },
        )
        .catch((err: unknown) => {
          this.logger.warn(
            '[team-meetings] failed to send confirmation email: ' +
              (err instanceof Error ? err.message : String(err)),
          );
        });
    }

    // 8. Mark prompt as acted (best-effort)
    void this.promptRepo
      .recordActed(input.doctorId, MEETING_MODAL_KEY, now)
      .catch((err: unknown) => {
        this.logger.warn(
          '[team-meetings] failed to record acted_at: ' +
            (err instanceof Error ? err.message : String(err)),
        );
      });

    return {
      id: meeting.id,
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      status: meeting.status,
      meetingUrl: meeting.meetingUrl,
      source: meeting.source,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async resolveGoogleMeet(
    startsAt: Date,
    endsAt: Date,
    doctorEmail: string | null,
    doctorName: string | null,
  ): Promise<{ meetingUrl: string | null; externalEventId: string | null }> {
    if (!this.googleCalendar.isConfigured()) {
      return { meetingUrl: this.jitsiUrl(), externalEventId: null };
    }

    const settings = await this.repo.getSettings(['team_meeting_host_profile_id']);
    const hostProfileId =
      settings.find((s) => s.key === 'team_meeting_host_profile_id')?.value ?? '';

    if (!hostProfileId) {
      this.logger.warn('[team-meetings] team_meeting_host_profile_id not configured — using Jitsi');
      return { meetingUrl: this.jitsiUrl(), externalEventId: null };
    }

    const integration = await this.googleIntegrationRepo.findByDoctorId(hostProfileId);
    if (!integration) {
      this.logger.warn('[team-meetings] host has no Google integration — using Jitsi');
      return { meetingUrl: this.jitsiUrl(), externalEventId: null };
    }

    // Refresh token if expired
    let activeIntegration = integration;
    if (integration.isTokenExpired()) {
      try {
        const refreshed = await this.googleCalendar.refreshAccessToken(integration.refreshToken);
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
        this.logger.warn('[team-meetings] host token refresh failed — using Jitsi');
        return { meetingUrl: this.jitsiUrl(), externalEventId: null };
      }
    }

    try {
      const title = doctorName
        ? `Reunión de equipo Delta con ${doctorName}`
        : 'Reunión de equipo Delta';
      const result = await this.googleCalendar.createEventWithMeet({
        accessToken: activeIntegration.accessToken,
        summary: title,
        description:
          'Reunión programada desde el panel de Delta Medical CRM.\n\n' +
          (doctorEmail ? `Especialista: ${doctorEmail}` : ''),
        startISO: startsAt.toISOString(),
        endISO: endsAt.toISOString(),
        attendeeEmail: doctorEmail ?? undefined,
      });
      return {
        meetingUrl: result.meetLink || this.jitsiUrl(),
        externalEventId: result.eventId || null,
      };
    } catch (err: unknown) {
      this.logger.warn(
        '[team-meetings] Google Calendar event creation failed — using Jitsi: ' +
          (err instanceof Error ? err.message : String(err)),
      );
      return { meetingUrl: this.jitsiUrl(), externalEventId: null };
    }
  }

  private jitsiUrl(): string {
    return `https://meet.jit.si/delta-${randomUUID()}`;
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
