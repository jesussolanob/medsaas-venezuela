import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Model
import { DoctorPromptModel } from './infrastructure/persistence/models/doctor-prompt.model';

// Repository binding
import { DOCTOR_PROMPT_REPOSITORY } from './domain/repositories/idoctor-prompt.repository';
import { SequelizeDoctorPromptRepository } from './infrastructure/persistence/repositories/sequelize-doctor-prompt.repository';

// Use cases
import { GetMeetingPromptStatusUseCase } from './application/use-cases/get-meeting-prompt-status.use-case';
import { RecordPromptShownUseCase } from './application/use-cases/record-prompt-shown.use-case';
import { SnoozePromptUseCase } from './application/use-cases/snooze-prompt.use-case';
import { DismissPromptUseCase } from './application/use-cases/dismiss-prompt.use-case';

// Controller
import { DoctorPromptsController } from './presentation/controllers/doctor-prompts.controller';

/**
 * DoctorPromptsModule — Generic lifecycle tracking for doctor-facing prompts.
 *
 * Phase 3 of the specialist-retention plan: tracks whether the "Queremos conocerte"
 * modal has been shown, snoozed, or dismissed.
 * Reused by Phase 4 (email-triggered flow) without modifications.
 *
 * Exports DOCTOR_PROMPT_REPOSITORY so TeamMeetingsModule can update `acted_at`
 * and ClearActed after cancellation.
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature model here.
 */
@Module({
  imports: [SequelizeModule.forFeature([DoctorPromptModel])],
  controllers: [DoctorPromptsController],
  providers: [
    {
      provide: DOCTOR_PROMPT_REPOSITORY,
      useClass: SequelizeDoctorPromptRepository,
    },
    GetMeetingPromptStatusUseCase,
    RecordPromptShownUseCase,
    SnoozePromptUseCase,
    DismissPromptUseCase,
  ],
  exports: [DOCTOR_PROMPT_REPOSITORY],
})
export class DoctorPromptsModule {}
