import { Module } from '@nestjs/common';

// Repository binding
import { RETENTION_INVITE_REPOSITORY } from './domain/repositories/iretention-invite.repository';
import { SequelizeRetentionInviteRepository } from './infrastructure/persistence/repositories/sequelize-retention-invite.repository';

// Use cases
import { DispatchMeetingInvitesUseCase } from './application/use-cases/dispatch-meeting-invites.use-case';
import { GrantGraceMonthUseCase } from './application/use-cases/grant-grace-month.use-case';
import { RecordInviteClickUseCase } from './application/use-cases/record-invite-click.use-case';
import { GetRetentionMetricsUseCase } from './application/use-cases/get-retention-metrics.use-case';

// Controllers
import { PublicRetentionController } from './presentation/controllers/public-retention.controller';
import { AdminRetentionController } from './presentation/controllers/admin-retention.controller';

// Cross-module dependencies
// EmailModule exports MailerService (for DispatchMeetingInvitesUseCase)
import { EmailModule } from '../email/email.module';

/**
 * RetentionInvitesModule — Phase 4 specialist-retention: invite emails + grace month.
 *
 * Responsibilities:
 *   - Dispatch meeting invite emails to free-trial specialists (pre + expired windows).
 *   - Track invite link clicks via HMAC tokens.
 *   - Grant a one-time grace month after a completed feedback meeting.
 *   - Expose aggregate retention metrics for the admin dashboard.
 *
 * Integration points:
 *   - DispatchMeetingInvitesUseCase is exported and injected @Optional into
 *     DispatchDoctorInactivityNoticesUseCase (RemindersModule) so invite
 *     dispatch runs first in the daily cron, with one-per-day enforcement.
 *   - GrantGraceMonthUseCase is exported and injected into AdminTeamMeetingsController
 *     (TeamMeetingsModule) for the POST :id/grant-grace endpoint.
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature models here — never add Sequelize to providers.
 */
@Module({
  imports: [EmailModule],
  controllers: [PublicRetentionController, AdminRetentionController],
  providers: [
    {
      provide: RETENTION_INVITE_REPOSITORY,
      useClass: SequelizeRetentionInviteRepository,
    },
    DispatchMeetingInvitesUseCase,
    GrantGraceMonthUseCase,
    RecordInviteClickUseCase,
    GetRetentionMetricsUseCase,
  ],
  exports: [DispatchMeetingInvitesUseCase, GrantGraceMonthUseCase],
})
export class RetentionInvitesModule {}
