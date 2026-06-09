import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { PatientModel } from './infrastructure/database/models/patient.model';
import { AccessAuditLogModel } from './infrastructure/database/models/access-audit-log.model';
// CryptoService is provided globally by CryptoModule (imported in AppModule) — no local import needed.
import { SequelizePatientRepository } from './infrastructure/database/repositories/sequelize-patient.repository';
import { PATIENT_REPOSITORY } from './domain/repositories/patient.repository';

import { CreatePatientUseCase } from './application/use-cases/patients/create-patient.use-case';
import { GetPatientUseCase } from './application/use-cases/patients/get-patient.use-case';
import { ListPatientsUseCase } from './application/use-cases/patients/list-patients.use-case';
import { SearchPatientsUseCase } from './application/use-cases/patients/search-patients.use-case';
import { UpdatePatientUseCase } from './application/use-cases/patients/update-patient.use-case';
import { DeletePatientUseCase } from './application/use-cases/patients/delete-patient.use-case';

import { PatientsController } from './presentation/controllers/patients.controller';

@Module({
  imports: [SequelizeModule.forFeature([PatientModel, AccessAuditLogModel])],
  controllers: [PatientsController],
  providers: [
    // CryptoService is global — injected from CryptoModule, not listed here.

    // Repository binding: domain interface → Sequelize implementation
    {
      provide: PATIENT_REPOSITORY,
      useClass: SequelizePatientRepository,
    },

    // Use cases
    CreatePatientUseCase,
    GetPatientUseCase,
    ListPatientsUseCase,
    SearchPatientsUseCase,
    UpdatePatientUseCase,
    DeletePatientUseCase,
  ],
  // Export the repository token so other modules (e.g. PrescriptionsModule) can
  // inject it for ownership checks without duplicating the Sequelize model.
  exports: [PATIENT_REPOSITORY],
})
export class PatientsModule {}
