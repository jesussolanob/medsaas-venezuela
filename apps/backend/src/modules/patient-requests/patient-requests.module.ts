import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Models
import { PatientRequestModel } from './infrastructure/database/models/patient-request.model';
import { PatientRequestAccessCodeModel } from './infrastructure/database/models/patient-request-access-code.model';
import { PatientRequestAttachmentModel } from './infrastructure/database/models/patient-request-attachment.model';

// Repository bindings
import { SequelizePatientRequestRepository } from './infrastructure/database/repositories/sequelize-patient-request.repository';
import { SequelizePatientRequestAccessCodeRepository } from './infrastructure/database/repositories/sequelize-patient-request-access-code.repository';
import { SequelizePatientRequestAttachmentRepository } from './infrastructure/database/repositories/sequelize-patient-request-attachment.repository';
import { PATIENT_REQUEST_REPOSITORY } from './domain/repositories/patient-request.repository';
import { PATIENT_REQUEST_ACCESS_CODE_REPOSITORY } from './domain/repositories/patient-request-access-code.repository';
import { PATIENT_REQUEST_ATTACHMENT_REPOSITORY } from './domain/repositories/patient-request-attachment.repository';

// Services
import { PatientRequestSessionService } from './application/services/patient-request-session.service';

// Use cases
import { CreatePatientRequestUseCase } from './application/use-cases/create-patient-request.use-case';
import { VerifyPatientRequestCodeUseCase } from './application/use-cases/verify-patient-request-code.use-case';
import { RequestNewPatientRequestCodeUseCase } from './application/use-cases/request-new-patient-request-code.use-case';
import { UploadPatientRequestAttachmentUseCase } from './application/use-cases/upload-patient-request-attachment.use-case';
import { SubmitPatientRequestUseCase } from './application/use-cases/submit-patient-request.use-case';
import { ListPatientRequestsUseCase } from './application/use-cases/list-patient-requests.use-case';
import { GetPatientRequestUseCase } from './application/use-cases/get-patient-request.use-case';

// Controller
import { PatientRequestsController } from './presentation/controllers/patient-requests.controller';

// Cross-module imports
import { PatientsModule } from '../patients/patients.module';
import { EmailModule } from '../email/email.module';
import { StorageModule } from '../storage/storage.module';

/**
 * PatientRequestsModule — allows doctors to request documents or responses from patients.
 *
 * IMPORTANT: CryptoService, Sequelize, and ConfigService are global —
 * provided by CryptoModule / SequelizeModule / ConfigModule in AppModule.
 * DO NOT add them to providers here (causes crash in the compiled dist).
 *
 * Cross-module dependencies:
 *   - PatientsModule  → PATIENT_REPOSITORY (patient ownership check, email, cedula lookup)
 *   - EmailModule     → MailerService (send code email to patient)
 *   - StorageModule   → STORAGE_PORT (private file upload + signed URLs)
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      PatientRequestModel,
      PatientRequestAccessCodeModel,
      PatientRequestAttachmentModel,
    ]),
    PatientsModule,
    EmailModule,
    StorageModule,
  ],
  controllers: [PatientRequestsController],
  providers: [
    // Repository bindings
    {
      provide: PATIENT_REQUEST_REPOSITORY,
      useClass: SequelizePatientRequestRepository,
    },
    {
      provide: PATIENT_REQUEST_ACCESS_CODE_REPOSITORY,
      useClass: SequelizePatientRequestAccessCodeRepository,
    },
    {
      provide: PATIENT_REQUEST_ATTACHMENT_REPOSITORY,
      useClass: SequelizePatientRequestAttachmentRepository,
    },

    // Shared service (session token sign/validate)
    PatientRequestSessionService,

    // Use cases
    CreatePatientRequestUseCase,
    VerifyPatientRequestCodeUseCase,
    RequestNewPatientRequestCodeUseCase,
    UploadPatientRequestAttachmentUseCase,
    SubmitPatientRequestUseCase,
    ListPatientRequestsUseCase,
    GetPatientRequestUseCase,
  ],
})
export class PatientRequestsModule {}
