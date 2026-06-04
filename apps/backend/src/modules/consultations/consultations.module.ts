import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { ConsultationModel } from './infrastructure/database/models/consultation.model';
import { SequelizeConsultationRepository } from './infrastructure/database/repositories/sequelize-consultation.repository';
import { CONSULTATION_REPOSITORY } from './domain/repositories/consultation.repository';

// CryptoService is global (provided by CryptoModule in AppModule) — no import needed.

import { CreateConsultationUseCase } from './application/use-cases/consultations/create-consultation.use-case';
import { UpdateConsultationUseCase } from './application/use-cases/consultations/update-consultation.use-case';
import { ApprovePaymentUseCase } from './application/use-cases/consultations/approve-payment.use-case';
import { GetConsultationByIdUseCase } from './application/use-cases/consultations/get-consultation-by-id.use-case';
import { GetPatientConsultationHistoryUseCase } from './application/use-cases/consultations/get-patient-consultation-history.use-case';
import { ListConsultationsUseCase } from './application/use-cases/consultations/list-consultations.use-case';
import { ListConsultationsWithPatientUseCase } from './application/use-cases/consultations/list-consultations-with-patient.use-case';

import { ConsultationsController } from './presentation/controllers/consultations.controller';

// PatientsModule exports PATIENT_REPOSITORY (decrypts PII within the doctor's scope).
// Needed by ListConsultationsWithPatientUseCase for billing receipts.
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [SequelizeModule.forFeature([ConsultationModel]), PatientsModule],
  controllers: [ConsultationsController],
  providers: [
    // Sequelize is global (provided by SequelizeModule.forRootAsync in AppModule) — no import needed.

    // Repository binding: domain interface → Sequelize implementation
    {
      provide: CONSULTATION_REPOSITORY,
      useClass: SequelizeConsultationRepository,
    },

    // Use cases
    CreateConsultationUseCase,
    UpdateConsultationUseCase,
    ApprovePaymentUseCase,
    GetConsultationByIdUseCase,
    GetPatientConsultationHistoryUseCase,
    ListConsultationsUseCase,
    ListConsultationsWithPatientUseCase,
  ],
})
export class ConsultationsModule {}
