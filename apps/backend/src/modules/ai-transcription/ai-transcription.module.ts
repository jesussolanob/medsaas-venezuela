import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';

// Models
import { AiRequestLogModel } from './infrastructure/database/models/ai-request-log.model';
import { DoctorProfileModel } from '../doctor-settings/infrastructure/database/models/doctor-profile.model';
import { PlanFeaturesModel } from '../doctor-settings/infrastructure/database/models/plan-features.model';
import { PlanConfigDoctorModel } from '../doctor-settings/infrastructure/database/models/plan-config-doctor.model';
import { PatientModel } from '../patients/infrastructure/database/models/patient.model';
import { AccessAuditLogModel } from '../patients/infrastructure/database/models/access-audit-log.model';
import { ConsultationModel } from '../consultations/infrastructure/database/models/consultation.model';

// Repository symbols
import { AI_REQUEST_LOG_REPOSITORY } from './domain/repositories/ai-request-log.repository';
import { PLAN_FEATURES_REPOSITORY } from '../doctor-settings/domain/repositories/plan-features.repository';
import { DOCTOR_PROFILE_REPOSITORY } from '../doctor-settings/domain/repositories/doctor-profile.repository';
import { PLAN_CONFIG_REPOSITORY } from '../doctor-settings/domain/repositories/plan-config.repository';
import { PATIENT_REPOSITORY } from '../patients/domain/repositories/patient.repository';
import { CONSULTATION_REPOSITORY } from '../consultations/domain/repositories/consultation.repository';

// Repository implementations
import { SequelizeAiRequestLogRepository } from './infrastructure/database/repositories/sequelize-ai-request-log.repository';
import { SequelizePlanFeaturesRepository } from '../doctor-settings/infrastructure/database/repositories/sequelize-plan-features.repository';
import { SequelizeDoctorProfileRepository } from '../doctor-settings/infrastructure/database/repositories/sequelize-doctor-profile.repository';
import { SequelizePlanConfigRepository } from '../doctor-settings/infrastructure/database/repositories/sequelize-plan-config.repository';
import { SequelizePatientRepository } from '../patients/infrastructure/database/repositories/sequelize-patient.repository';
import { SequelizeConsultationRepository } from '../consultations/infrastructure/database/repositories/sequelize-consultation.repository';

// Port symbols + adapters
import { TRANSCRIPTION_PORT } from './application/ports/transcription.port';
import { GeminiTranscriptionAdapter } from './infrastructure/adapters/gemini-transcription.adapter';
import { AI_TEXT_GENERATOR_PORT } from './application/ports/ai-text-generator.port';
import { GeminiTextAdapter } from './infrastructure/adapters/gemini-text.adapter';

// Use cases
import { TranscribeAudioUseCase } from './application/use-cases/transcribe-audio.use-case';
import { AiTextUseCase } from './application/use-cases/ai-text.use-case';

// Controller
import { AiTranscriptionController } from './presentation/controllers/ai-transcription.controller';

/**
 * AiTranscriptionModule
 *
 * Owns:
 *   - POST /api/ai/transcribe (TranscribeAudioUseCase)
 *   - POST /api/ai/text      (AiTextUseCase — improve_block, summarize_report, patient_history)
 *
 * Plan gating is performed inline in each use case (fail-closed).
 *
 * Patient and Consultation repos are registered locally following the established
 * project pattern (each module owns the repos it needs). The Sequelize repos for
 * patients and consultations require CryptoService (PHI decryption).
 *
 * IMPORTANT: Never declare Sequelize or global providers in the providers array.
 * Use SequelizeModule.forFeature() for model registration only.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      AiRequestLogModel,
      DoctorProfileModel,
      PlanFeaturesModel,
      PlanConfigDoctorModel,
      PatientModel,
      AccessAuditLogModel,
      ConsultationModel,
    ]),
  ],
  controllers: [AiTranscriptionController],
  providers: [
    // AI request log repository
    {
      provide: AI_REQUEST_LOG_REPOSITORY,
      useClass: SequelizeAiRequestLogRepository,
    },

    // Doctor plan resolution
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

    // Patient repo (for patient_history action — anti-IDOR scoping)
    {
      provide: PATIENT_REPOSITORY,
      useClass: SequelizePatientRepository,
    },

    // Consultation repo (for patient_history action)
    {
      provide: CONSULTATION_REPOSITORY,
      useClass: SequelizeConsultationRepository,
    },

    // Gemini transcription adapter — bound to port symbol
    {
      provide: TRANSCRIPTION_PORT,
      useFactory: (config: ConfigService) => new GeminiTranscriptionAdapter(config),
      inject: [ConfigService],
    },

    // Gemini text adapter — bound to port symbol
    {
      provide: AI_TEXT_GENERATOR_PORT,
      useFactory: (config: ConfigService) => new GeminiTextAdapter(config),
      inject: [ConfigService],
    },

    // Use cases
    TranscribeAudioUseCase,
    AiTextUseCase,
  ],
})
export class AiTranscriptionModule {}
