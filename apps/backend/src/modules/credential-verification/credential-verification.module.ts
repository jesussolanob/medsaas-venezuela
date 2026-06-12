import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Models
import { CredentialVerifierModel } from './infrastructure/database/models/credential-verifier.model';
import { CredentialVerificationModel } from './infrastructure/database/models/credential-verification.model';
import { RegistrationProfileModel } from '../doctor-registration/infrastructure/database/models/registration-profile.model';

// Repository bindings
import { CREDENTIAL_VERIFIER_REPOSITORY } from './domain/repositories/credential-verifier.repository';
import { SequelizeCredentialVerifierRepository } from './infrastructure/database/repositories/sequelize-credential-verifier.repository';

import { CREDENTIAL_VERIFICATION_REPOSITORY } from './domain/repositories/credential-verification.repository';
import { SequelizeCredentialVerificationRepository } from './infrastructure/database/repositories/sequelize-credential-verification.repository';

import { DOCTOR_PROFILE_FOR_VERIFICATION_REPOSITORY } from './domain/repositories/doctor-profile.repository';
import { SequelizeDoctorProfileForVerificationRepository } from './infrastructure/database/repositories/sequelize-doctor-profile-for-verification.repository';

// Port binding
import { MPPS_VERIFICATION_PORT } from './domain/ports/mpps-verification.port';
import { SacsXajaxAdapter } from './infrastructure/adapters/sacs-xajax.adapter';

// Use cases
import { VerifyMppsUseCase } from './application/use-cases/verify-mpps.use-case';
import { GetCredentialVerificationsUseCase } from './application/use-cases/get-credential-verifications.use-case';

// Guards
import { RolesGuard } from '../../presentation/guards/roles.guard';

// Controller
import { CredentialVerificationController } from './presentation/controllers/credential-verification.controller';

/**
 * CredentialVerificationModule
 *
 * Implements MPPS credential verification against the Venezuelan SACS portal.
 *
 * Exported use cases:
 *   - VerifyMppsUseCase — consumed by DoctorRegistrationModule for
 *     fire-and-forget post-registration verification.
 *
 * IMPORTANT: Sequelize is NOT added to the providers array — it is already
 * registered globally by SequelizeModule.forRootAsync in AppModule.
 * Adding it again here causes a crash in the dist build.
 *
 * TLS: SacsXajaxAdapter uses a dedicated https.Agent({rejectUnauthorized:false})
 * scoped only to the SACS host. This is NEVER applied globally.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      CredentialVerifierModel,
      CredentialVerificationModel,
      RegistrationProfileModel,
    ]),
  ],
  controllers: [CredentialVerificationController],
  providers: [
    // Repository bindings
    {
      provide: CREDENTIAL_VERIFIER_REPOSITORY,
      useClass: SequelizeCredentialVerifierRepository,
    },
    {
      provide: CREDENTIAL_VERIFICATION_REPOSITORY,
      useClass: SequelizeCredentialVerificationRepository,
    },
    {
      provide: DOCTOR_PROFILE_FOR_VERIFICATION_REPOSITORY,
      useClass: SequelizeDoctorProfileForVerificationRepository,
    },

    // Port binding (Strategy pattern)
    {
      provide: MPPS_VERIFICATION_PORT,
      useClass: SacsXajaxAdapter,
    },

    // Guards
    RolesGuard,

    // Use cases
    VerifyMppsUseCase,
    GetCredentialVerificationsUseCase,
  ],
  exports: [
    // VerifyMppsUseCase is exported so DoctorRegistrationModule can inject it
    // for fire-and-forget post-registration verification.
    VerifyMppsUseCase,
  ],
})
export class CredentialVerificationModule {}
