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
  DOCTOR_PROMPT_REPOSITORY,
  type IDoctorPromptRepository,
} from '../../../doctor-prompts/domain/repositories/idoctor-prompt.repository';
import {
  GOOGLE_INTEGRATION_REPOSITORY,
  type IGoogleIntegrationRepository,
} from '../../../integrations/domain/repositories/google-integration.repository';
import { GoogleCalendarService } from '../../../integrations/infrastructure/google/google-calendar.service';
import { MailerService } from '../../../email/application/services/mailer.service';
import { TeamMeetingNotFoundError } from '../../domain/errors/team-meeting-not-found.error';
import { TeamMeetingAccessDeniedError } from '../../domain/errors/team-meeting-access-denied.error';
import { TeamMeetingTooLateError } from '../../domain/errors/team-meeting-too-late.error';
import { MEETING_MODAL_KEY } from '@delta/shared-types';
import { adminMeetingsUrl, doctorMeetingUrl } from '../utils/app-links';

export interface CancelTeamMeetingInput {
  meetingId: string;
  actorId: string;
  /** When true, the actor is a super_admin and the 2h cutoff and ownership checks are skipped. */
  isAdmin: boolean;
}

/**
 * CancelTeamMeetingUseCase
 *
 * Cancels a scheduled team meeting:
 *   - Doctor: checks ownership and 2h cutoff.
 *   - Admin: skips cutoff check (can cancel anytime).
 *   1. Deletes the availability block.
 *   2. Cancels the Google Calendar event (if present).
 *   3. Sets status='cancelled'.
 *   4. Sends cancellation email to the doctor.
 *   5. Sends cancellation email to the team (super-admins).
 *   6. Clears acted_at on the meeting modal prompt (so the modal can reappear).
 */
@Injectable()
export class CancelTeamMeetingUseCase {
  private readonly logger = new Logger(CancelTeamMeetingUseCase.name);

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

  async execute(input: CancelTeamMeetingInput): Promise<void> {
    const now = new Date();

    const meeting = await this.repo.findById(input.meetingId);
    if (!meeting) throw new TeamMeetingNotFoundError();

    if (!input.isAdmin) {
      if (!meeting.isOwnedBy(input.actorId)) {
        throw new TeamMeetingAccessDeniedError();
      }
      if (!meeting.isModifiable(now)) {
        throw new TeamMeetingTooLateError();
      }
    } else {
      // Admin can cancel any scheduled or non-cancelled meeting
      if (meeting.isCancelled()) {
        throw new TeamMeetingNotFoundError();
      }
    }

    // 1. Delete availability block
    if (meeting.availabilityBlockId) {
      try {
        await this.blockRepo.delete(meeting.availabilityBlockId);
      } catch {
        this.logger.warn('[team-meetings] failed to delete availability block on cancel');
      }
    }

    // 2. Cancel Google Calendar event (best-effort)
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
              this.logger.warn('[team-meetings] host token refresh failed on cancel');
            }
          }
          try {
            await this.googleCalendar.cancelEvent(
              activeIntegration.accessToken,
              meeting.externalEventId,
            );
          } catch (err: unknown) {
            this.logger.warn(
              '[team-meetings] Google Calendar event cancellation failed: ' +
                (err instanceof Error ? err.message : String(err)),
            );
          }
        }
      }
    }

    // 3. Update meeting status
    await this.repo.update(meeting.id, { status: 'cancelled' });

    // 4 & 5. Send cancellation emails to doctor and team (best-effort)
    const [doctorProfile, superAdmins] = await Promise.all([
      this.repo.getDoctorProfile(meeting.doctorId),
      this.repo.findAllSuperAdmins(),
    ]);
    const startsAtText = this.formatCaracasTime(meeting.startsAt);

    if (doctorProfile?.email) {
      void this.mailer
        .sendTemplate(
          'team_meeting_cancelled',
          doctorProfile.email,
          {
            doctorName: doctorProfile.name ?? 'Especialista',
            startsAtText,
            meetingUrl: meeting.meetingUrl ?? 'N/D',
            manageUrl: doctorMeetingUrl(),
          },
          { type: 'doctor', id: meeting.doctorId },
        )
        .catch((err: unknown) => {
          this.logger.warn(
            '[team-meetings] failed to send doctor cancellation email: ' +
              (err instanceof Error ? err.message : String(err)),
          );
        });
    }

    for (const admin of superAdmins) {
      void this.mailer
        .sendTemplate(
          'team_meeting_cancelled_admin',
          admin.email,
          {
            doctorName: doctorProfile?.name ?? 'Especialista',
            doctorEmail: doctorProfile?.email ?? '',
            startsAtText,
            meetingUrl: meeting.meetingUrl ?? 'N/D',
            manageUrl: adminMeetingsUrl(),
          },
          { type: 'admin', id: admin.email },
        )
        .catch((err: unknown) => {
          this.logger.warn(
            '[team-meetings] failed to send admin cancellation email: ' +
              (err instanceof Error ? err.message : String(err)),
          );
        });
    }

    // 6. Clear acted_at so the modal can re-appear
    void this.promptRepo.clearActed(meeting.doctorId, MEETING_MODAL_KEY).catch((err: unknown) => {
      this.logger.warn(
        '[team-meetings] failed to clear acted_at: ' +
          (err instanceof Error ? err.message : String(err)),
      );
    });
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
