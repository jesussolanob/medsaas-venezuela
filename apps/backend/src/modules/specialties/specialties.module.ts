import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { SpecialtyModel } from './infrastructure/persistence/models/specialty.model';
import { SequelizeSpecialtyRepository } from './infrastructure/persistence/repositories/sequelize-specialty.repository';
import { SPECIALTY_REPOSITORY } from './domain/repositories/specialty.repository';

import { ListAllSpecialtiesUseCase } from './application/use-cases/list-all-specialties.use-case';
import { ListActiveSpecialtiesUseCase } from './application/use-cases/list-active-specialties.use-case';
import { CreateSpecialtyUseCase } from './application/use-cases/create-specialty.use-case';
import { UpdateSpecialtyUseCase } from './application/use-cases/update-specialty.use-case';

import { RolesGuard } from '../../presentation/guards/roles.guard';

import { SpecialtiesController } from './presentation/controllers/specialties.controller';
import { AdminSpecialtiesController } from './presentation/controllers/admin-specialties.controller';

/**
 * SpecialtiesModule — medical specialty catalogue management.
 *
 * Public surface:
 *   GET /api/specialties — no auth (selector for registration + settings)
 *
 * Admin surface (super_admin only):
 *   GET  /api/admin/specialties — list all specialties (active + inactive)
 *   POST /api/admin/specialties — add a new specialty without redeploy
 *   PUT  /api/admin/specialties/:id — edit / activate / deactivate
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature model here — never re-declare the
 * Sequelize provider in this module's providers array.
 */
@Module({
  imports: [SequelizeModule.forFeature([SpecialtyModel])],
  controllers: [SpecialtiesController, AdminSpecialtiesController],
  providers: [
    {
      provide: SPECIALTY_REPOSITORY,
      useClass: SequelizeSpecialtyRepository,
    },
    RolesGuard,
    ListAllSpecialtiesUseCase,
    ListActiveSpecialtiesUseCase,
    CreateSpecialtyUseCase,
    UpdateSpecialtyUseCase,
  ],
  exports: [SPECIALTY_REPOSITORY],
})
export class SpecialtiesModule {}
