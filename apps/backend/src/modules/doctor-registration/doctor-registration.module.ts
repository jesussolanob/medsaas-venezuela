import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Models
import { RegistrationProfileModel } from './infrastructure/database/models/registration-profile.model';

// Repository binding
import { DOCTOR_REGISTRATION_REPOSITORY } from './domain/repositories/doctor-registration.repository';
import { SequelizeDoctorRegistrationRepository } from './infrastructure/database/repositories/sequelize-doctor-registration.repository';

// Use cases
import { CompleteRegistrationUseCase } from './application/use-cases/complete-registration.use-case';
import { ListPendingVerificationsUseCase } from './application/use-cases/list-pending-verifications.use-case';
import { UpdateVerificationStatusUseCase } from './application/use-cases/update-verification-status.use-case';

// Guards
import { RolesGuard } from '../../presentation/guards/roles.guard';

// Controller
import { DoctorRegistrationController } from './presentation/controllers/doctor-registration.controller';

// Email
import { EmailModule } from '../email/email.module';

/**
 * DoctorRegistrationModule
 *
 * Manages the doctor registration + admin verification workflow:
 *
 *   Doctor:
 *     POST /api/doctor/registration — complete profile after first login.
 *
 *   Admin (super_admin only):
 *     GET  /api/admin/doctor-verifications?status=pending
 *     PUT  /api/admin/doctor-verifications/:doctorId
 *
 * NOTE: verification_status does NOT currently restrict system access.
 * This is preparatory metadata for Etapa 2.
 *
 * IMPORTANT: Sequelize is NOT added to the providers array — it is already
 * registered globally by SequelizeModule.forRootAsync in AppModule.
 * Adding it again here causes a crash in the dist build.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([RegistrationProfileModel]),
    // EmailModule is imported to access MailerService for admin notifications.
    EmailModule,
  ],
  controllers: [DoctorRegistrationController],
  providers: [
    {
      provide: DOCTOR_REGISTRATION_REPOSITORY,
      useClass: SequelizeDoctorRegistrationRepository,
    },
    RolesGuard,
    CompleteRegistrationUseCase,
    ListPendingVerificationsUseCase,
    UpdateVerificationStatusUseCase,
  ],
})
export class DoctorRegistrationModule {}
