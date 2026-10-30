import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TEAM_MEETING_REPOSITORY,
  type ITeamMeetingRepository,
} from '../../domain/repositories/iteam-meeting.repository';
import { MailerService } from '../../../email/application/services/mailer.service';
import { adminMeetingsUrl, doctorMeetingUrl } from '../utils/app-links';

export interface DispatchMeetingRemindersResult {
  reminders24hSent: number;
  reminders1hSent: number;
  remindersFailed: number;
}

/**
 * DispatchMeetingRemindersUseCase
 *
 * Called from the 15-min cron endpoint. Sends two reminder emails:
 *   - 24h reminder: meeting starts in [22h, 26h] from now
 *   - 1h  reminder: meeting starts in [45min, 75min] from now
 *
 * Idempotency (mark-then-send pattern):
 *   The row is claimed first via UPDATE … WHERE IS NULL RETURNING id.
 *   The email is only sent when THIS call claims the row.
 *   A concurrent cron run that finds the column already set returns false
 *   and skips the send entirely — no duplicate emails.
 *
 * Team notifications: super-admins receive the same reminder emails.
 *
 * Cap: max 50 meetings per run to stay within the 15-min window.
 */
@Injectable()
export class DispatchMeetingRemindersUseCase {
  private readonly logger = new Logger(DispatchMeetingRemindersUseCase.name);

  constructor(
    @Inject(TEAM_MEETING_REPOSITORY)
    private readonly repo: ITeamMeetingRepository,
    private readonly mailer: MailerService,
  ) {}

  async execute(): Promise<DispatchMeetingRemindersResult> {
    const now = new Date();
    let reminders24hSent = 0;
    let reminders1hSent = 0;
    let remindersFailed = 0;

    // Fetch meetings and super-admins in parallel.
    const [rows, superAdmins] = await Promise.all([
      this.repo.findMeetingsNeedingReminder(now, 50),
      this.repo.findAllSuperAdmins(),
    ]);

    for (const row of rows) {
      const hoursUntil = (row.startsAt.getTime() - now.getTime()) / (1000 * 60 * 60);

      const needs24h = row.reminder24hSentAt === null && hoursUntil >= 22 && hoursUntil <= 26;
      const needs1h = row.reminder1hSentAt === null && hoursUntil >= 0.75 && hoursUntil <= 1.25;

      if (!needs24h && !needs1h) continue;

      const startsAtText = this.formatCaracasTime(row.startsAt);

      if (needs24h) {
        // Mark-then-send: claim the row before sending to prevent duplicate
        // emails from concurrent cron runs.
        const claimed = await this.repo.markReminder24hSent(row.id, now);
        if (claimed) {
          try {
            await this.mailer.sendTemplate(
              'team_meeting_reminder',
              row.doctorEmail,
              {
                doctorName: row.doctorName ?? 'Especialista',
                startsAtText,
                meetingUrl: row.meetingUrl ?? 'N/D',
                manageUrl: doctorMeetingUrl(),
              },
              { type: 'doctor', id: row.doctorId },
            );
            for (const admin of superAdmins) {
              await this.mailer.sendTemplate(
                'team_meeting_reminder_admin',
                admin.email,
                {
                  doctorName: row.doctorName ?? 'Especialista',
                  doctorEmail: row.doctorEmail,
                  startsAtText,
                  meetingUrl: row.meetingUrl ?? 'N/D',
                  manageUrl: adminMeetingsUrl(),
                },
                { type: 'admin', id: admin.email },
              );
            }
            reminders24hSent++;
          } catch (err: unknown) {
            remindersFailed++;
            this.logger.warn(
              `[team-meetings] 24h reminder failed for meeting ${row.id}: ` +
                (err instanceof Error ? err.message : String(err)),
            );
          }
        }
      }

      if (needs1h) {
        const claimed = await this.repo.markReminder1hSent(row.id, now);
        if (claimed) {
          try {
            await this.mailer.sendTemplate(
              'team_meeting_reminder',
              row.doctorEmail,
              {
                doctorName: row.doctorName ?? 'Especialista',
                startsAtText,
                meetingUrl: row.meetingUrl ?? 'N/D',
                manageUrl: doctorMeetingUrl(),
              },
              { type: 'doctor', id: row.doctorId },
            );
            for (const admin of superAdmins) {
              await this.mailer.sendTemplate(
                'team_meeting_reminder_admin',
                admin.email,
                {
                  doctorName: row.doctorName ?? 'Especialista',
                  doctorEmail: row.doctorEmail,
                  startsAtText,
                  meetingUrl: row.meetingUrl ?? 'N/D',
                  manageUrl: adminMeetingsUrl(),
                },
                { type: 'admin', id: admin.email },
              );
            }
            reminders1hSent++;
          } catch (err: unknown) {
            remindersFailed++;
            this.logger.warn(
              `[team-meetings] 1h reminder failed for meeting ${row.id}: ` +
                (err instanceof Error ? err.message : String(err)),
            );
          }
        }
      }
    }

    return { reminders24hSent, reminders1hSent, remindersFailed };
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
