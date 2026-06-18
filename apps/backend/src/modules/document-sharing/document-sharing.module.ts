import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { SharedDocumentLinkModel } from './infrastructure/database/models/shared-document-link.model';
import { DocumentAccessCodeModel } from './infrastructure/database/models/document-access-code.model';
import { SequelizeSharedDocumentLinkRepository } from './infrastructure/database/repositories/sequelize-shared-document-link.repository';
import { SequelizeDocumentAccessCodeRepository } from './infrastructure/database/repositories/sequelize-document-access-code.repository';
import { SHARED_DOCUMENT_LINK_REPOSITORY } from './domain/repositories/shared-document-link.repository';
import { DOCUMENT_ACCESS_CODE_REPOSITORY } from './domain/repositories/document-access-code.repository';

import { PdfGeneratorService } from './infrastructure/pdf/pdf-generator.service';

import { ShareConsultationUseCase } from './application/use-cases/document-sharing/share-consultation.use-case';
import { VerifyCodeUseCase } from './application/use-cases/document-sharing/verify-code.use-case';
import { DownloadDocumentUseCase } from './application/use-cases/document-sharing/download-document.use-case';
import { RequestNewCodeUseCase } from './application/use-cases/document-sharing/request-new-code.use-case';

import { DocumentSharingController } from './presentation/controllers/document-sharing.controller';

// Cross-module imports — each exports only its repository token.
import { ConsultationsModule } from '../consultations/consultations.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { EhrModule } from '../ehr/ehr.module';
import { PatientsModule } from '../patients/patients.module';
import { EmailModule } from '../email/email.module';
import { DoctorSettingsModule } from '../doctor-settings/doctor-settings.module';

/**
 * DocumentSharingModule — allows doctors to share consultation documents
 * with patients via a time-limited link + 6-digit code.
 *
 * IMPORTANT: CryptoService, Sequelize, and ConfigService are global —
 * provided by CryptoModule / SequelizeModule / ConfigModule in AppModule.
 * DO NOT add them to providers here (causes crash in the compiled dist).
 *
 * Cross-module dependencies:
 *   - ConsultationsModule   → CONSULTATION_REPOSITORY (ownership check + data)
 *   - PrescriptionsModule   → PRESCRIPTION_REPOSITORY (prescription data for PDF)
 *   - EhrModule             → EHR_REPOSITORY (EHR data for PDF)
 *   - PatientsModule        → PATIENT_REPOSITORY (patient email + name for email)
 *   - EmailModule           → MailerService (send email with code)
 *   - DoctorSettingsModule  → DOCTOR_PROFILE_REPOSITORY (doctor name in PDF header)
 */
@Module({
  imports: [
    SequelizeModule.forFeature([SharedDocumentLinkModel, DocumentAccessCodeModel]),
    ConsultationsModule,
    PrescriptionsModule,
    EhrModule,
    PatientsModule,
    EmailModule,
    DoctorSettingsModule,
  ],
  controllers: [DocumentSharingController],
  providers: [
    // Repository bindings
    {
      provide: SHARED_DOCUMENT_LINK_REPOSITORY,
      useClass: SequelizeSharedDocumentLinkRepository,
    },
    {
      provide: DOCUMENT_ACCESS_CODE_REPOSITORY,
      useClass: SequelizeDocumentAccessCodeRepository,
    },

    // Infrastructure services
    PdfGeneratorService,

    // Use cases
    ShareConsultationUseCase,
    VerifyCodeUseCase,
    DownloadDocumentUseCase,
    RequestNewCodeUseCase,
  ],
})
export class DocumentSharingModule {}
