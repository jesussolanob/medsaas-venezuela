import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DoctorSettingsModule } from '../doctor-settings/doctor-settings.module';

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
  imports: [
    SequelizeModule.forFeature([OfficeModel]),
    // forwardRef breaks the circular dependency:
    // DoctorSettingsModule → OfficesModule → DoctorSettingsModule
    // We need DOCTOR_PROFILE_REPOSITORY to clear the onboarding skip flag
    // when a doctor creates or updates a real office.
    forwardRef(() => DoctorSettingsModule),
  ],
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
  // Export OFFICE_REPOSITORY so BookingModule can inject it for slot generation.
  // Export CreateOfficeUseCase so DoctorSettingsModule/SkipOfficeUseCase can reuse it
  // during the minimum onboarding wizard (creates default "Consultorio" if none exists).
  exports: [OFFICE_REPOSITORY, CreateOfficeUseCase],
})
export class OfficesModule {}
