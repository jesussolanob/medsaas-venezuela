import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { ConsultationBlockCatalogModel } from './infrastructure/persistence/models/consultation-block-catalog.model';
import { DoctorConsultationBlockModel } from './infrastructure/persistence/models/doctor-consultation-block.model';
import { SpecialtyDefaultBlockModel } from './infrastructure/persistence/models/specialty-default-block.model';
import { DoctorProfileModel } from '../doctor-settings/infrastructure/database/models/doctor-profile.model';

import { CONSULTATION_BLOCK_REPOSITORY } from './domain/repositories/consultation-block.repository';
import { SequelizeConsultationBlockRepository } from './infrastructure/persistence/repositories/sequelize-consultation-block.repository';

import { GetConsultationBlocksUseCase } from './application/use-cases/consultation-blocks/get-consultation-blocks.use-case';
import { SaveConsultationBlocksUseCase } from './application/use-cases/consultation-blocks/save-consultation-blocks.use-case';

import { ConsultationBlocksController } from './presentation/controllers/consultation-blocks.controller';

/**
 * ConsultationBlocksModule
 *
 * Manages consultation block configuration per doctor:
 *   GET  /api/doctor/consultation-blocks — full state (catalog + config + resolved)
 *   PUT  /api/doctor/consultation-blocks — replace config atomically
 *
 * Models registered here:
 *   - ConsultationBlockCatalogModel   → consultation_block_catalog
 *   - DoctorConsultationBlockModel    → doctor_consultation_blocks
 *   - SpecialtyDefaultBlockModel      → specialty_default_blocks
 *   - DoctorProfileModel              → profiles (read specialty only)
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register feature models here — never re-declare the Sequelize
 * provider in this module's providers array.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      ConsultationBlockCatalogModel,
      DoctorConsultationBlockModel,
      SpecialtyDefaultBlockModel,
      DoctorProfileModel,
    ]),
  ],
  controllers: [ConsultationBlocksController],
  providers: [
    {
      provide: CONSULTATION_BLOCK_REPOSITORY,
      useClass: SequelizeConsultationBlockRepository,
    },
    GetConsultationBlocksUseCase,
    SaveConsultationBlocksUseCase,
  ],
})
export class ConsultationBlocksModule {}
