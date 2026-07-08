import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Models
import { SharedFileModel } from './infrastructure/database/models/shared-file.model';
import { PatientModel } from '../patients/infrastructure/database/models/patient.model';
import { AccessAuditLogModel } from '../patients/infrastructure/database/models/access-audit-log.model';

// Repository binding
import { SequelizeSharedFileRepository } from './infrastructure/database/repositories/sequelize-shared-file.repository';
import { SHARED_FILE_REPOSITORY } from './domain/repositories/shared-file.repository';

// External repositories reused (read-only reference)
import { PATIENT_REPOSITORY } from '../patients/domain/repositories/patient.repository';
import { SequelizePatientRepository } from '../patients/infrastructure/database/repositories/sequelize-patient.repository';
import { PATIENT_PORTAL_REPOSITORY } from '../patient-portal/domain/repositories/patient-portal.repository';
import { SequelizePatientPortalRepository } from '../patient-portal/infrastructure/database/repositories/sequelize-patient-portal.repository';

// Patient-portal models needed by SequelizePatientPortalRepository
import { AppointmentModel } from '../appointments/infrastructure/database/models/appointment.model';
import { PatientPackageModel } from '../packages/infrastructure/database/models/patient-package.model';
import { PrescriptionModel } from '../prescriptions/infrastructure/database/models/prescription.model';
import { PatientMessageModel } from '../patient-portal/infrastructure/database/models/patient-message.model';

// Storage port (already provided as global by StorageModule; re-imported here
// so SequelizeSharedFileRepository can inject it via @Inject(STORAGE_PORT))
import { StorageModule } from '../storage/storage.module';

// Use cases — doctor side
import { CreateSharedFileDoctorUseCase } from './application/use-cases/shared-files/create-shared-file-doctor.use-case';
import { ListSharedFilesDoctorUseCase } from './application/use-cases/shared-files/list-shared-files-doctor.use-case';
import { UpdateSharedFileDoctorUseCase } from './application/use-cases/shared-files/update-shared-file-doctor.use-case';
import { DeleteSharedFileDoctorUseCase } from './application/use-cases/shared-files/delete-shared-file-doctor.use-case';
import { MarkReadDoctorUseCase } from './application/use-cases/shared-files/mark-read-doctor.use-case';
import { GetUnreadCountsDoctorUseCase } from './application/use-cases/shared-files/get-unread-counts-doctor.use-case';

// Use cases — patient side
import { CreateSharedFilePatientUseCase } from './application/use-cases/shared-files/create-shared-file-patient.use-case';
import { ListSharedFilesPatientUseCase } from './application/use-cases/shared-files/list-shared-files-patient.use-case';
import { MarkReadPatientUseCase } from './application/use-cases/shared-files/mark-read-patient.use-case';

// Controllers
import { DoctorSharedFilesController } from './presentation/controllers/doctor-shared-files.controller';
import { PatientSharedFilesController } from './presentation/controllers/patient-shared-files.controller';

/**
 * SharedFilesModule — "Seguimiento del Paciente" / Shared Health Space.
 *
 * Manages the bidirectional exchange of tasks, instructions, comments, and files
 * between doctors and their patients.
 *
 * DESIGN DECISIONS:
 *   - We do NOT import PatientsModule or PatientPortalModule directly to avoid
 *     duplicate provider registrations (same pattern as PatientPortalModule).
 *     Instead we register the required Sequelize models via forFeature([...]) and
 *     provide local bindings for the repository symbols this module needs.
 *
 *   - StorageModule is imported so STORAGE_PORT is available for signed URL
 *     generation in SequelizeSharedFileRepository.
 *
 *   - CryptoService is provided globally by CryptoModule in AppModule — no import needed.
 *
 * NEVER declare Sequelize or Sequelize-related providers directly in providers[] —
 * that causes the dist to crash at runtime. Use SequelizeModule.forFeature() only.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      SharedFileModel,
      PatientModel,
      AccessAuditLogModel,
      AppointmentModel,
      PatientPackageModel,
      PrescriptionModel,
      PatientMessageModel,
    ]),
    StorageModule,
  ],
  controllers: [DoctorSharedFilesController, PatientSharedFilesController],
  providers: [
    // SharedFile repository
    {
      provide: SHARED_FILE_REPOSITORY,
      useClass: SequelizeSharedFileRepository,
    },
    // Patient repository (for ownership validation)
    {
      provide: PATIENT_REPOSITORY,
      useClass: SequelizePatientRepository,
    },
    // Patient portal repository (for authUserId → patientId resolution)
    {
      provide: PATIENT_PORTAL_REPOSITORY,
      useClass: SequelizePatientPortalRepository,
    },
    // Use cases — doctor
    CreateSharedFileDoctorUseCase,
    ListSharedFilesDoctorUseCase,
    UpdateSharedFileDoctorUseCase,
    DeleteSharedFileDoctorUseCase,
    MarkReadDoctorUseCase,
    GetUnreadCountsDoctorUseCase,
    // Use cases — patient
    CreateSharedFilePatientUseCase,
    ListSharedFilesPatientUseCase,
    MarkReadPatientUseCase,
  ],
})
export class SharedFilesModule {}
