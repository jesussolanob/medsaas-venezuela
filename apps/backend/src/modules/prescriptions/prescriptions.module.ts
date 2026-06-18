import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { PrescriptionModel } from './infrastructure/database/models/prescription.model';
import { SequelizePrescriptionRepository } from './infrastructure/database/repositories/sequelize-prescription.repository';
import { PRESCRIPTION_REPOSITORY } from './domain/repositories/prescription.repository';

// CryptoService is global (provided by CryptoModule in AppModule) — no import needed.
// PatientsModule exports PATIENT_REPOSITORY so CreatePrescriptionUseCase can verify
// patient ownership before persisting.
import { PatientsModule } from '../patients/patients.module';

import { CreatePrescriptionUseCase } from './application/use-cases/prescriptions/create-prescription.use-case';
import { GetPatientPrescriptionsUseCase } from './application/use-cases/prescriptions/get-patient-prescriptions.use-case';
import { GetPrescriptionByIdUseCase } from './application/use-cases/prescriptions/get-prescription-by-id.use-case';

import { PrescriptionsController } from './presentation/controllers/prescriptions.controller';

@Module({
  imports: [SequelizeModule.forFeature([PrescriptionModel]), PatientsModule],
  controllers: [PrescriptionsController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: PRESCRIPTION_REPOSITORY,
      useClass: SequelizePrescriptionRepository,
    },

    // Use cases
    CreatePrescriptionUseCase,
    GetPatientPrescriptionsUseCase,
    GetPrescriptionByIdUseCase,
  ],
  // Export PRESCRIPTION_REPOSITORY so DocumentSharingModule can fetch prescriptions
  // for the consultation PDF without duplicating the Sequelize model.
  exports: [PRESCRIPTION_REPOSITORY],
})
export class PrescriptionsModule {}
