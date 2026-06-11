import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { PatientIdentityModel } from './infrastructure/persistence/models/patient-identity.model';
import { SequelizePatientIdentityRepository } from './infrastructure/persistence/repositories/sequelize-patient-identity.repository';
import { PATIENT_IDENTITY_REPOSITORY } from './domain/repositories/patient-identity.repository';
import { ResolvePatientIdentityUseCase } from './application/use-cases/resolve-patient-identity.use-case';

/**
 * PatientIdentitiesModule — internal module, NOT routed.
 *
 * Provides ResolvePatientIdentityUseCase for consumption by PatientsModule
 * and BookingModule. Exposes NO HTTP controllers.
 *
 * PRIVACY: No endpoint exposes patient_identities data to callers.
 */
@Module({
  imports: [SequelizeModule.forFeature([PatientIdentityModel])],
  providers: [
    {
      provide: PATIENT_IDENTITY_REPOSITORY,
      useClass: SequelizePatientIdentityRepository,
    },
    ResolvePatientIdentityUseCase,
  ],
  // Export the use case so PatientsModule and BookingModule can inject it.
  exports: [ResolvePatientIdentityUseCase],
})
export class PatientIdentitiesModule {}
