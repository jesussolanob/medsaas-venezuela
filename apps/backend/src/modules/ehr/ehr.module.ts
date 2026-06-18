import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { EhrRecordModel } from './infrastructure/database/models/ehr-record.model';
import { SequelizeEhrRepository } from './infrastructure/database/repositories/sequelize-ehr.repository';
import { EHR_REPOSITORY } from './domain/repositories/ehr.repository';

// CryptoService is global (provided by CryptoModule in AppModule) — no import needed.
// Sequelize is global (provided by SequelizeModule.forRootAsync in AppModule) — no import needed.

import { CreateEhrRecordUseCase } from './application/use-cases/ehr/create-ehr-record.use-case';
import { GetPatientEhrUseCase } from './application/use-cases/ehr/get-patient-ehr.use-case';
import { UpdateEhrRecordUseCase } from './application/use-cases/ehr/update-ehr-record.use-case';
import { GetEhrByIdUseCase } from './application/use-cases/ehr/get-ehr-by-id.use-case';

import { EhrController } from './presentation/controllers/ehr.controller';

@Module({
  imports: [SequelizeModule.forFeature([EhrRecordModel])],
  controllers: [EhrController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: EHR_REPOSITORY,
      useClass: SequelizeEhrRepository,
    },

    // Use cases
    CreateEhrRecordUseCase,
    GetPatientEhrUseCase,
    UpdateEhrRecordUseCase,
    GetEhrByIdUseCase,
  ],
  // Export EHR_REPOSITORY so DocumentSharingModule can fetch EHR records
  // for the consultation PDF without duplicating the Sequelize model.
  exports: [EHR_REPOSITORY],
})
export class EhrModule {}
