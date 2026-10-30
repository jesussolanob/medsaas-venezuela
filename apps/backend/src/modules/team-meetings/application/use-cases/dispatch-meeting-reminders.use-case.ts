import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TEAM_MEETING_REPOSITORY,
  type ITeamMeetingRepository,
} from '../../domain/repositories/iteam-meeting.repository';
import { MailerService } from '../../../email/application/services/mailer.service';

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
 * Idempotency is enforced by reminder_24h_sent_at / reminder_1h_sent_at columns.
 * A row is only eligible once per window (null = not yet sent).
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

    const rows = await this.repo.findMeetingsNeedingReminder(now, 50);

    for (const row of rows) {
      const hoursUntil = (row.startsAt.getTime() - now.getTime()) / (1000 * 60 * 60);

      const needs24h = row.reminder24hSentAt === null && hoursUntil >= 22 && hoursUntil <= 26;
      const needs1h = row.reminder1hSentAt === null && hoursUntil >= 0.75 && hoursUntil <= 1.25;

      if (!needs24h && !needs1h) continue;

      const startsAtText = this.formatCaracasTime(row.startsAt);

      if (needs24h) {
        try {
          await this.mailer.sendTemplate(
            'team_meeting_reminder',
            row.doctorEmail,
            {
              doctorName: row.doctorName ?? 'Especialista',
              startsAtText,
              meetingUrl: row.meetingUrl ?? 'N/D',
              manageUrl: `${process.env['FRONTEND_URL'] ?? 'https://app.deltasalud.app'}/doctor/perfil`,
            },
            { type: 'doctor', id: row.doctorId },
          );
          await this.repo.markReminder24hSent(row.id, now);
          reminders24hSent++;
        } catch (err: unknown) {
          remindersFailed++;
          this.logger.warn(
            `[team-meetings] 24h reminder failed for meeting ${row.id}: ` +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }

      if (needs1h) {
        try {
          await this.mailer.sendTemplate(
            'team_meeting_reminder',
            row.doctorEmail,
            {
              doctorName: row.doctorName ?? 'Especialista',
              startsAtText,
              meetingUrl: row.meetingUrl ?? 'N/D',
              manageUrl: `${process.env['FRONTEND_URL'] ?? 'https://app.deltasalud.app'}/doctor/perfil`,
            },
            { type: 'doctor', id: row.doctorId },
          );
          await this.repo.markReminder1hSent(row.id, now);
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
