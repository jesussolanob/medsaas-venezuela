import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { PatientModel } from './infrastructure/database/models/patient.model';
import { AccessAuditLogModel } from './infrastructure/database/models/access-audit-log.model';
import { CryptoService } from './infrastructure/crypto/crypto.service';
import { SequelizePatientRepository } from './infrastructure/database/repositories/sequelize-patient.repository';
import { PATIENT_REPOSITORY } from './domain/repositories/patient.repository';

import { CreatePatientUseCase } from './application/use-cases/patients/create-patient.use-case';
import { GetPatientUseCase } from './application/use-cases/patients/get-patient.use-case';
import { ListPatientsUseCase } from './application/use-cases/patients/list-patients.use-case';
import { RevealPatientDataUseCase } from './application/use-cases/patients/reveal-patient-data.use-case';
import { SearchPatientsUseCase } from './application/use-cases/patients/search-patients.use-case';
import { UpdatePatientUseCase } from './application/use-cases/patients/update-patient.use-case';
import { DeletePatientUseCase } from './application/use-cases/patients/delete-patient.use-case';

import { PatientsController } from './presentation/controllers/patients.controller';

@Module({
  imports: [SequelizeModule.forFeature([PatientModel, AccessAuditLogModel])],
  controllers: [PatientsController],
  providers: [
    // Crypto helper (reads env keys at boot)
    CryptoService,

    // Repository binding: domain interface → Sequelize implementation
    {
      provide: PATIENT_REPOSITORY,
      useClass: SequelizePatientRepository,
    },

    // Use cases
    CreatePatientUseCase,
    GetPatientUseCase,
    ListPatientsUseCase,
    RevealPatientDataUseCase,
    SearchPatientsUseCase,
    UpdatePatientUseCase,
    DeletePatientUseCase,
  ],
})
export class PatientsModule {}
