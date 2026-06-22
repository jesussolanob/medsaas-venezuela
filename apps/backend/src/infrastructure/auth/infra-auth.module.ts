import { Global, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Model needed by the identity repository
import { AuthProfileModel } from '../../modules/auth/infrastructure/database/models/auth-profile.model';

// Repository binding (reuses the one from AuthModule — same token/impl)
import { IDENTITY_REPOSITORY } from '../../modules/auth/domain/repositories/identity.repository';
import { SequelizeIdentityRepository } from '../../modules/auth/infrastructure/database/repositories/sequelize-identity.repository';

// Account-status port (block enforcement)
import { ACCOUNT_STATUS_PORT } from './account-status.port';
import { SequelizeAccountStatusAdapter } from './sequelize-account-status.adapter';

// Auth guards and services
import { IdentityResolverService } from './identity-resolver.service';
import { DevAuthGuard } from './dev-auth.guard';
import { Auth0Guard } from './auth0.guard';
import { AppAuthGuard } from './app-auth.guard';

/**
 * InfraAuthModule
 *
 * Global module that makes AppAuthGuard (and its dependencies) injectable
 * across all feature modules without importing this module in each one.
 *
 * Why @Global: guards decorated with @UseGuards() are resolved from the DI
 * container of the module that declares them, or from a global provider. Since
 * every controller in the app uses AppAuthGuard, registering it globally avoids
 * circular-import issues and repetitive imports.
 *
 * Sequelize note: AuthProfileModel is registered here via SequelizeModule.forFeature
 * to make @InjectModel(AuthProfileModel) available to SequelizeIdentityRepository.
 * The AuthModule also registers it independently — NestJS deduplicates model
 * registrations safely.
 *
 * NEVER add Sequelize instance directly to providers[] — only use forFeature().
 */
@Global()
@Module({
  imports: [SequelizeModule.forFeature([AuthProfileModel])],
  providers: [
    {
      provide: IDENTITY_REPOSITORY,
      useClass: SequelizeIdentityRepository,
    },
    {
      provide: ACCOUNT_STATUS_PORT,
      useClass: SequelizeAccountStatusAdapter,
    },
    IdentityResolverService,
    DevAuthGuard,
    Auth0Guard,
    AppAuthGuard,
  ],
  exports: [
    AppAuthGuard,
    DevAuthGuard,
    Auth0Guard,
    IdentityResolverService,
    // Must be exported: AppAuthGuard is re-resolved in every consuming module's
    // injector (via @UseGuards), so its ACCOUNT_STATUS_PORT dependency has to be
    // globally available — otherwise modules like StorageModule fail to bootstrap.
    ACCOUNT_STATUS_PORT,
  ],
})
export class InfraAuthModule {}
