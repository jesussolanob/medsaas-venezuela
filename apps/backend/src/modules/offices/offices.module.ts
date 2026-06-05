import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { OfficeModel } from './infrastructure/database/models/office.model';
import { SequelizeOfficeRepository } from './infrastructure/database/repositories/sequelize-office.repository';
import { OFFICE_REPOSITORY } from './domain/repositories/office.repository';

import { ListOfficesUseCase } from './application/use-cases/offices/list-offices.use-case';
import { CreateOfficeUseCase } from './application/use-cases/offices/create-office.use-case';
import { UpdateOfficeUseCase } from './application/use-cases/offices/update-office.use-case';
import { DeleteOfficeUseCase } from './application/use-cases/offices/delete-office.use-case';
import { ToggleOfficeUseCase } from './application/use-cases/offices/toggle-office.use-case';

import { OfficesController } from './presentation/controllers/offices.controller';

/**
 * OfficesModule — Doctor office (consultorio) management.
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature model (OfficeModel) here — never re-declare
 * the Sequelize provider in this module's providers array.
 *
 * Exports OFFICE_REPOSITORY so BookingModule can use it for slot generation
 * without registering the model a second time.
 */
@Module({
  imports: [SequelizeModule.forFeature([OfficeModel])],
  controllers: [OfficesController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: OFFICE_REPOSITORY,
      useClass: SequelizeOfficeRepository,
    },

    // Use cases
    ListOfficesUseCase,
    CreateOfficeUseCase,
    UpdateOfficeUseCase,
    DeleteOfficeUseCase,
    ToggleOfficeUseCase,
  ],
  // Export the repository token so BookingModule can inject it for slot generation.
  exports: [OFFICE_REPOSITORY],
})
export class OfficesModule {}
