import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { PatientModel } from './infrastructure/database/models/patient.model';
import { AccessAuditLogModel } from './infrastructure/database/models/access-audit-log.model';
// CryptoService is provided globally by CryptoModule (imported in AppModule) — no local import needed.
import { SequelizePatientRepository } from './infrastructure/database/repositories/sequelize-patient.repository';
import { PATIENT_REPOSITORY } from './domain/repositories/patient.repository';

import { CreatePatientUseCase } from './application/use-cases/patients/create-patient.use-case';
import { GetPatientUseCase } from './application/use-cases/patients/get-patient.use-case';
import { ListPatientsUseCase } from './application/use-cases/patients/list-patients.use-case';
import { SearchPatientsUseCase } from './application/use-cases/patients/search-patients.use-case';
import { UpdatePatientUseCase } from './application/use-cases/patients/update-patient.use-case';
import { DeletePatientUseCase } from './application/use-cases/patients/delete-patient.use-case';

import { PatientsController } from './presentation/controllers/patients.controller';
import { PatientIdentitiesModule } from '../patient-identities/patient-identities.module';
// DOCTOR_PROFILE_REPOSITORY is provided LOCALLY (model + repo class) instead of
// importing DoctorSettingsModule: that module imports FinancesModule which imports
// PatientsModule, so importing it here creates a boot-breaking DI cycle
// (Patients → DoctorSettings → Finances → Patients). The repo only needs the
// DoctorProfileModel, so we register it directly (Sequelize forFeature is additive/safe).
import { DOCTOR_PROFILE_REPOSITORY } from '../doctor-settings/domain/repositories/doctor-profile.repository';
import { SequelizeDoctorProfileRepository } from '../doctor-settings/infrastructure/database/repositories/sequelize-doctor-profile.repository';
import { DoctorProfileModel } from '../doctor-settings/infrastructure/database/models/doctor-profile.model';

@Module({
  imports: [
    SequelizeModule.forFeature([PatientModel, AccessAuditLogModel, DoctorProfileModel]),
    PatientIdentitiesModule,
  ],
  controllers: [PatientsController],
  providers: [
    // CryptoService is global — injected from CryptoModule, not listed here.

    // Repository binding: domain interface → Sequelize implementation
    {
      provide: PATIENT_REPOSITORY,
      useClass: SequelizePatientRepository,
    },

    // Doctor profile repository for the doctor-email guard in Create/UpdatePatient.
    // Bound locally (see note above) to avoid the DoctorSettings→Finances→Patients cycle.
    {
      provide: DOCTOR_PROFILE_REPOSITORY,
      useClass: SequelizeDoctorProfileRepository,
    },

    // Use cases
    CreatePatientUseCase,
    GetPatientUseCase,
    ListPatientsUseCase,
    SearchPatientsUseCase,
    UpdatePatientUseCase,
    DeletePatientUseCase,
  ],
  // Export the repository token so other modules (e.g. PrescriptionsModule) can
  // inject it for ownership checks without duplicating the Sequelize model.
  exports: [PATIENT_REPOSITORY],
})
export class PatientsModule {}
