import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { RoleCapabilityModel } from './infrastructure/database/models/role-capability.model';
import { SequelizeRoleCapabilityRepository } from './infrastructure/database/repositories/sequelize-role-capability.repository';
import { ROLE_CAPABILITY_REPOSITORY } from './domain/repositories/role-capability.repository';

import { ResolveCapabilitiesUseCase } from './application/use-cases/capabilities/resolve-capabilities.use-case';
import { ListAllCapabilitiesUseCase } from './application/use-cases/capabilities/list-all-capabilities.use-case';
import { SetCapabilityUseCase } from './application/use-cases/capabilities/set-capability.use-case';

import { RolesGuard } from '../../presentation/guards/roles.guard';
import { CapabilitiesGuard } from './presentation/guards/capabilities.guard';

import { MeCapabilitiesController } from './presentation/controllers/me-capabilities.controller';
import { AdminCapabilitiesController } from './presentation/controllers/admin-capabilities.controller';

/**
 * CapabilitiesModule — RBAC by capability (DB-driven, no token baking).
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature model (RoleCapabilityModel) here —
 * never re-declare the Sequelize or Redis providers in this module's providers.
 *
 * Redis is injected via REDIS_CLIENT from the global RedisModule.
 * The CapabilitiesGuard is exported so other modules can use it.
 */
@Module({
  imports: [SequelizeModule.forFeature([RoleCapabilityModel])],
  controllers: [MeCapabilitiesController, AdminCapabilitiesController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: ROLE_CAPABILITY_REPOSITORY,
      useClass: SequelizeRoleCapabilityRepository,
    },

    // Guards
    RolesGuard,
    CapabilitiesGuard,

    // Use cases
    ResolveCapabilitiesUseCase,
    ListAllCapabilitiesUseCase,
    SetCapabilityUseCase,
  ],
  exports: [
    // Export guard and use case so other modules can apply @RequireCapability()
    CapabilitiesGuard,
    ResolveCapabilitiesUseCase,
  ],
})
export class CapabilitiesModule {}
