import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Model
import { TeamMeetingModel } from './infrastructure/persistence/models/team-meeting.model';

// Repository binding
import { TEAM_MEETING_REPOSITORY } from './domain/repositories/iteam-meeting.repository';
import { SequelizeTeamMeetingRepository } from './infrastructure/persistence/repositories/sequelize-team-meeting.repository';

// Use cases
import { GetMeetingSlotsUseCase } from './application/use-cases/get-meeting-slots.use-case';
import { CreateTeamMeetingUseCase } from './application/use-cases/create-team-meeting.use-case';
import { GetCurrentTeamMeetingUseCase } from './application/use-cases/get-current-team-meeting.use-case';
import { RescheduleTeamMeetingUseCase } from './application/use-cases/reschedule-team-meeting.use-case';
import { CancelTeamMeetingUseCase } from './application/use-cases/cancel-team-meeting.use-case';
import { ListTeamMeetingsAdminUseCase } from './application/use-cases/list-team-meetings-admin.use-case';
import { UpdateTeamMeetingAdminUseCase } from './application/use-cases/update-team-meeting-admin.use-case';
import { GetTeamMeetingHostUseCase } from './application/use-cases/get-team-meeting-host.use-case';
import { UpdateTeamMeetingHostUseCase } from './application/use-cases/update-team-meeting-host.use-case';
import { DispatchMeetingRemindersUseCase } from './application/use-cases/dispatch-meeting-reminders.use-case';

// Controllers
import { DoctorTeamMeetingsController } from './presentation/controllers/doctor-team-meetings.controller';
import { AdminTeamMeetingsController } from './presentation/controllers/admin-team-meetings.controller';

// Cross-module dependencies
// AvailabilityBlocksModule exports AVAILABILITY_BLOCK_REPOSITORY
import { AvailabilityBlocksModule } from '../availability-blocks/availability-blocks.module';
// DoctorPromptsModule exports DOCTOR_PROMPT_REPOSITORY
import { DoctorPromptsModule } from '../doctor-prompts/doctor-prompts.module';
// IntegrationsModule exports GoogleCalendarService + GOOGLE_INTEGRATION_REPOSITORY
import { IntegrationsModule } from '../integrations/integrations.module';
// EmailModule exports MailerService
import { EmailModule } from '../email/email.module';

/**
 * TeamMeetingsModule — Phase 3 specialist retention: "Queremos conocerte" meetings.
 *
 * Manages 30-min video calls between the Delta team and specialists.
 *
 * Dependencies:
 *   - AvailabilityBlocksModule: AVAILABILITY_BLOCK_REPOSITORY (creates/deletes blocks)
 *   - DoctorPromptsModule: DOCTOR_PROMPT_REPOSITORY (acts/clears acted_at)
 *   - IntegrationsModule: GoogleCalendarService + GOOGLE_INTEGRATION_REPOSITORY (Meet links)
 *   - EmailModule: MailerService (confirmation/reminder emails)
 *
 * Exports:
 *   - DispatchMeetingRemindersUseCase — injected @Optional by RemindersModule cron
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature model here — never add Sequelize to providers.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([TeamMeetingModel]),
    AvailabilityBlocksModule,
    DoctorPromptsModule,
    IntegrationsModule,
    EmailModule,
  ],
  controllers: [DoctorTeamMeetingsController, AdminTeamMeetingsController],
  providers: [
    {
      provide: TEAM_MEETING_REPOSITORY,
      useClass: SequelizeTeamMeetingRepository,
    },
    GetMeetingSlotsUseCase,
    CreateTeamMeetingUseCase,
    GetCurrentTeamMeetingUseCase,
    RescheduleTeamMeetingUseCase,
    CancelTeamMeetingUseCase,
    ListTeamMeetingsAdminUseCase,
    UpdateTeamMeetingAdminUseCase,
    GetTeamMeetingHostUseCase,
    UpdateTeamMeetingHostUseCase,
    DispatchMeetingRemindersUseCase,
  ],
  exports: [DispatchMeetingRemindersUseCase],
})
export class TeamMeetingsModule {}
