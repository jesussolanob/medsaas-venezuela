import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { ConsultationModel } from './infrastructure/database/models/consultation.model';
import { ConsultationExtraItemModel } from './infrastructure/database/models/consultation-extra-item.model';
import { SequelizeConsultationRepository } from './infrastructure/database/repositories/sequelize-consultation.repository';
import { CONSULTATION_REPOSITORY } from './domain/repositories/consultation.repository';

// CryptoService is global (provided by CryptoModule in AppModule) — no import needed.

import { CreateConsultationUseCase } from './application/use-cases/consultations/create-consultation.use-case';
import { UpdateConsultationUseCase } from './application/use-cases/consultations/update-consultation.use-case';
import { ApprovePaymentUseCase } from './application/use-cases/consultations/approve-payment.use-case';
import { SyncConsultationDateUseCase } from './application/use-cases/consultations/sync-consultation-date.use-case';
import { ApprovePaymentWithExtrasUseCase } from './application/use-cases/consultations/approve-payment-with-extras.use-case';
import { UpdatePaymentDetailsUseCase } from './application/use-cases/consultations/update-payment-details.use-case';
import { GetConsultationByIdUseCase } from './application/use-cases/consultations/get-consultation-by-id.use-case';
import { GetPatientConsultationHistoryUseCase } from './application/use-cases/consultations/get-patient-consultation-history.use-case';
import { ListConsultationsUseCase } from './application/use-cases/consultations/list-consultations.use-case';
import { ListConsultationsWithPatientUseCase } from './application/use-cases/consultations/list-consultations-with-patient.use-case';
import { ApplyNoShowFeeUseCase } from './application/use-cases/consultations/apply-no-show-fee.use-case';
import { BlockContentSanitizer } from './application/block-content-sanitizer';

import { ConsultationsController } from './presentation/controllers/consultations.controller';

// PatientsModule exports PATIENT_REPOSITORY (decrypts PII within the doctor's scope).
// Needed by ListConsultationsWithPatientUseCase for billing receipts.
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [
    SequelizeModule.forFeature([ConsultationModel, ConsultationExtraItemModel]),
    PatientsModule,
  ],
  controllers: [ConsultationsController],
  providers: [
    // Sequelize is global (provided by SequelizeModule.forRootAsync in AppModule) — no import needed.

    // Repository binding: domain interface → Sequelize implementation
    {
      provide: CONSULTATION_REPOSITORY,
      useClass: SequelizeConsultationRepository,
    },

    // Services
    BlockContentSanitizer,

    // Use cases
    CreateConsultationUseCase,
    UpdateConsultationUseCase,
    ApprovePaymentUseCase,
    ApprovePaymentWithExtrasUseCase,
    UpdatePaymentDetailsUseCase,
    GetConsultationByIdUseCase,
    GetPatientConsultationHistoryUseCase,
    ListConsultationsUseCase,
    ListConsultationsWithPatientUseCase,
    ApplyNoShowFeeUseCase,
    SyncConsultationDateUseCase,
  ],
  // SyncConsultationDateUseCase se exporta para AppointmentsModule: la reagenda
  // de una cita tiene que arrastrar la fecha de su consulta.
  exports: [CONSULTATION_REPOSITORY, CreateConsultationUseCase, SyncConsultationDateUseCase],
})
export class ConsultationsModule {}
