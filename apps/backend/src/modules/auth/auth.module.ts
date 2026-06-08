import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Model
import { AuthProfileModel } from './infrastructure/database/models/auth-profile.model';

// Repository binding
import { IDENTITY_REPOSITORY } from './domain/repositories/identity.repository';
import { SequelizeIdentityRepository } from './infrastructure/database/repositories/sequelize-identity.repository';

// Use case
import { ResolveIdentityUseCase } from './application/use-cases/resolve-identity.use-case';

// Controller
import { AuthController } from './presentation/controllers/auth.controller';

/**
 * AuthModule
 *
 * Owns the identity resolution endpoint used by the BFF after an Auth0 login.
 * Does NOT use DevAuthGuard — callers authenticate via x-internal-auth-secret.
 *
 * ConfigModule is global (registered in AppModule) — no re-import needed.
 *
 * Sequelize providers are NOT injected directly into providers[]:
 * AuthProfileModel is registered via SequelizeModule.forFeature and injected
 * into SequelizeIdentityRepository via @InjectModel.
 */
@Module({
  imports: [SequelizeModule.forFeature([AuthProfileModel])],
  controllers: [AuthController],
  providers: [
    {
      provide: IDENTITY_REPOSITORY,
      useClass: SequelizeIdentityRepository,
    },
    ResolveIdentityUseCase,
  ],
})
export class AuthModule {}
