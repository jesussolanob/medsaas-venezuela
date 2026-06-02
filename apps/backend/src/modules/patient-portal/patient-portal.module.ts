import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Models registered for this module
import { PatientModel } from '../patients/infrastructure/database/models/patient.model';
import { AppointmentModel } from '../appointments/infrastructure/database/models/appointment.model';
import { PatientPackageModel } from '../packages/infrastructure/database/models/patient-package.model';
import { PrescriptionModel } from '../prescriptions/infrastructure/database/models/prescription.model';
import { PatientMessageModel } from './infrastructure/database/models/patient-message.model';

// Repository binding
import { SequelizePatientPortalRepository } from './infrastructure/database/repositories/sequelize-patient-portal.repository';
import { PATIENT_PORTAL_REPOSITORY } from './domain/repositories/patient-portal.repository';

// Use cases
import { GetPatientDashboardUseCase } from './application/use-cases/patient-portal/get-patient-dashboard.use-case';
import { GetPatientAppointmentsUseCase } from './application/use-cases/patient-portal/get-patient-appointments.use-case';
import { GetPatientPackagesUseCase } from './application/use-cases/patient-portal/get-patient-packages.use-case';
import { GetPatientPrescriptionsUseCase } from './application/use-cases/patient-portal/get-patient-prescriptions.use-case';
import { GetPatientMessagesUseCase } from './application/use-cases/patient-portal/get-patient-messages.use-case';
import { SendPatientMessageUseCase } from './application/use-cases/patient-portal/send-patient-message.use-case';
import { GetPatientProfileUseCase } from './application/use-cases/patient-portal/get-patient-profile.use-case';
import { UpdatePatientProfileUseCase } from './application/use-cases/patient-portal/update-patient-profile.use-case';

// Controller
import { PatientController } from './presentation/controllers/patient.controller';

/**
 * PatientPortalModule — self-contained portal for authenticated patients.
 *
 * Models registered here come from other modules' persistence layers.
 * We intentionally do NOT import PatientsModule / AppointmentsModule / etc.
 * to avoid duplicate provider registrations. Instead we declare the Sequelize
 * models we need via SequelizeModule.forFeature([...]).
 *
 * CryptoService is global (provided by CryptoModule in AppModule) — no import needed.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      PatientModel,
      AppointmentModel,
      PatientPackageModel,
      PrescriptionModel,
      PatientMessageModel,
    ]),
  ],
  controllers: [PatientController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: PATIENT_PORTAL_REPOSITORY,
      useClass: SequelizePatientPortalRepository,
    },

    // Use cases
    GetPatientDashboardUseCase,
    GetPatientAppointmentsUseCase,
    GetPatientPackagesUseCase,
    GetPatientPrescriptionsUseCase,
    GetPatientMessagesUseCase,
    SendPatientMessageUseCase,
    GetPatientProfileUseCase,
    UpdatePatientProfileUseCase,
  ],
})
export class PatientPortalModule {}
