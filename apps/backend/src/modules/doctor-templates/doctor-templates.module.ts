import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { DoctorTemplateModel } from './infrastructure/database/models/doctor-template.model';
import { SequelizeDoctorTemplateRepository } from './infrastructure/database/repositories/sequelize-doctor-template.repository';
import { DOCTOR_TEMPLATE_REPOSITORY } from './domain/repositories/doctor-template.repository';

import { ListDoctorTemplatesUseCase } from './application/use-cases/doctor-templates/list-doctor-templates.use-case';
import { UpsertDoctorTemplateUseCase } from './application/use-cases/doctor-templates/upsert-doctor-template.use-case';

import { DoctorTemplatesController } from './presentation/controllers/doctor-templates.controller';

/**
 * DoctorTemplatesModule — PDF template configuration for doctors.
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature model (DoctorTemplateModel) here — never
 * re-declare the Sequelize provider in this module's providers array.
 */
@Module({
  imports: [SequelizeModule.forFeature([DoctorTemplateModel])],
  controllers: [DoctorTemplatesController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: DOCTOR_TEMPLATE_REPOSITORY,
      useClass: SequelizeDoctorTemplateRepository,
    },

    // Use cases
    ListDoctorTemplatesUseCase,
    UpsertDoctorTemplateUseCase,
  ],
  // Export repository so DocumentSharingModule can fetch the 'informe' template
  // for the render-data endpoint without duplicating the model registration.
  exports: [DOCTOR_TEMPLATE_REPOSITORY],
})
export class DoctorTemplatesModule {}
