import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';

// Models
import { AiRequestLogModel } from './infrastructure/database/models/ai-request-log.model';
import { DoctorProfileModel } from '../doctor-settings/infrastructure/database/models/doctor-profile.model';
import { PlanFeaturesModel } from '../doctor-settings/infrastructure/database/models/plan-features.model';
import { PlanConfigDoctorModel } from '../doctor-settings/infrastructure/database/models/plan-config-doctor.model';

// Repository symbols
import { AI_REQUEST_LOG_REPOSITORY } from './domain/repositories/ai-request-log.repository';
import { PLAN_FEATURES_REPOSITORY } from '../doctor-settings/domain/repositories/plan-features.repository';
import { DOCTOR_PROFILE_REPOSITORY } from '../doctor-settings/domain/repositories/doctor-profile.repository';
import { PLAN_CONFIG_REPOSITORY } from '../doctor-settings/domain/repositories/plan-config.repository';

// Repository implementations
import { SequelizeAiRequestLogRepository } from './infrastructure/database/repositories/sequelize-ai-request-log.repository';
import { SequelizePlanFeaturesRepository } from '../doctor-settings/infrastructure/database/repositories/sequelize-plan-features.repository';
import { SequelizeDoctorProfileRepository } from '../doctor-settings/infrastructure/database/repositories/sequelize-doctor-profile.repository';
import { SequelizePlanConfigRepository } from '../doctor-settings/infrastructure/database/repositories/sequelize-plan-config.repository';

// Port symbol + adapter
import { TRANSCRIPTION_PORT } from './application/ports/transcription.port';
import { GeminiTranscriptionAdapter } from './infrastructure/adapters/gemini-transcription.adapter';

// Use case
import { TranscribeAudioUseCase } from './application/use-cases/transcribe-audio.use-case';

// Controller
import { AiTranscriptionController } from './presentation/controllers/ai-transcription.controller';

/**
 * AiTranscriptionModule
 *
 * Owns the POST /api/ai/transcribe endpoint.
 *
 * Plan gating is performed inline in TranscribeAudioUseCase (fail-closed).
 * The three doctor-settings repos (profile, plan-features, plan-config) are
 * registered locally — they are NOT exported by DoctorSettingsModule (except
 * DOCTOR_PROFILE_REPOSITORY). Re-registering here follows the established
 * project pattern (each module owns the repos it needs).
 *
 * IMPORTANT: Never declare Sequelize or global providers in the providers array.
 * Use SequelizeModule.forFeature() for model registration only.
 *
 * Redis (REDIS_CLIENT) is global via RedisModule — not needed here.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      AiRequestLogModel,
      DoctorProfileModel,
      PlanFeaturesModel,
      PlanConfigDoctorModel,
    ]),
  ],
  controllers: [AiTranscriptionController],
  providers: [
    // AI request log repository
    {
      provide: AI_REQUEST_LOG_REPOSITORY,
      useClass: SequelizeAiRequestLogRepository,
    },
    // Doctor plan resolution — registered locally (not exported by DoctorSettingsModule)
    {
      provide: PLAN_FEATURES_REPOSITORY,
      useClass: SequelizePlanFeaturesRepository,
    },
    {
      provide: DOCTOR_PROFILE_REPOSITORY,
      useClass: SequelizeDoctorProfileRepository,
    },
    {
      provide: PLAN_CONFIG_REPOSITORY,
      useClass: SequelizePlanConfigRepository,
    },
    // Gemini transcription adapter — bound to port symbol
    {
      provide: TRANSCRIPTION_PORT,
      useFactory: (config: ConfigService) => new GeminiTranscriptionAdapter(config),
      inject: [ConfigService],
    },
    // Use case
    TranscribeAudioUseCase,
  ],
})
export class AiTranscriptionModule {}
