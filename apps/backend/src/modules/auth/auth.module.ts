import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Models
import { AuthProfileModel } from './infrastructure/database/models/auth-profile.model';
// Re-registered from admin module — same class object, same DB table.
// Required here so SequelizeIdentityRepository can inject it via @InjectModel.
import { AdminSubscriptionModel } from '../admin/infrastructure/database/models/subscription.model';

// Repository bindings
import { IDENTITY_REPOSITORY } from './domain/repositories/identity.repository';
import { SequelizeIdentityRepository } from './infrastructure/database/repositories/sequelize-identity.repository';
import { LOGIN_TOUCH_REPOSITORY } from './domain/repositories/login-touch.repository';
import { SequelizeLoginTouchRepository } from './infrastructure/database/repositories/sequelize-login-touch.repository';

// Use cases
import { ResolveIdentityUseCase } from './application/use-cases/resolve-identity.use-case';
import { ProcessLoginTouchUseCase } from './application/use-cases/process-login-touch.use-case';

// Controller
import { AuthController } from './presentation/controllers/auth.controller';

/**
 * AuthModule
 *
 * Owns two endpoints:
 *   POST /api/auth/resolve-identity — machine-to-machine (Auth0 BFF), authenticated
 *     via x-internal-auth-secret. Also performs a login touch on successful resolution.
 *   POST /api/auth/login-touch — fires a login touch for the authenticated user.
 *     Authenticated via AppAuthGuard (mode-aware: dev or auth0).
 *
 * ConfigModule is global (registered in AppModule) — no re-import needed.
 *
 * Guards (AppAuthGuard, DevAuthGuard, Auth0Guard) come from the global
 * InfraAuthModule — no need to re-declare them here.
 *
 * Sequelize providers are NOT injected directly into providers[]:
 *   AuthProfileModel is registered via SequelizeModule.forFeature and injected
 *   into SequelizeIdentityRepository via @InjectModel.
 *
 * SequelizeLoginTouchRepository uses raw SQL via the global Sequelize instance —
 * no additional forFeature() registration needed for its queries.
 */
@Module({
  imports: [SequelizeModule.forFeature([AuthProfileModel, AdminSubscriptionModel])],
  controllers: [AuthController],
  providers: [
    {
      provide: IDENTITY_REPOSITORY,
      useClass: SequelizeIdentityRepository,
    },
    {
      provide: LOGIN_TOUCH_REPOSITORY,
      useClass: SequelizeLoginTouchRepository,
    },
    ResolveIdentityUseCase,
    ProcessLoginTouchUseCase,
  ],
})
export class AuthModule {}
