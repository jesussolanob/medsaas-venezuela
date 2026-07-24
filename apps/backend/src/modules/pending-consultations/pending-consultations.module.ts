import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { PendingConsultationModel } from './infrastructure/database/models/pending-consultation.model';
import { SequelizePendingConsultationRepository } from './infrastructure/database/repositories/sequelize-pending-consultation.repository';
import { PENDING_CONSULTATION_REPOSITORY } from './domain/repositories/pending-consultation.repository';

// Use cases
import { GetDoctorPendingConsultationsUseCase } from './application/use-cases/get-doctor-pending-consultations.use-case';
import { CreatePendingConsultationsUseCase } from './application/use-cases/create-pending-consultations.use-case';
import { CancelPendingConsultationUseCase } from './application/use-cases/cancel-pending-consultation.use-case';
import { ExpireDuePendingConsultationsUseCase } from './application/use-cases/expire-due-pending-consultations.use-case';
import { SchedulePendingConsultationUseCase } from './application/use-cases/schedule-pending-consultation.use-case';
import { GetPendingConsultationByTokenUseCase } from './application/use-cases/get-pending-consultation-by-token.use-case';
import { SchedulePendingConsultationByTokenUseCase } from './application/use-cases/schedule-pending-consultation-by-token.use-case';
import { CreateDoctorPendingConsultationsUseCase } from './application/use-cases/create-doctor-pending-consultations.use-case';
import { DispatchPendingConsultationRemindersUseCase } from './application/use-cases/dispatch-pending-consultation-reminders.use-case';

// Infrastructure service
import { PendingConsultationTokenService } from './application/services/pending-consultation-token.service';

// Controllers
import { DoctorPendingConsultationsController } from './presentation/controllers/doctor-pending-consultations.controller';
import { PublicPendingConsultationsController } from './presentation/controllers/public-pending-consultations.controller';

// Cross-module dependencies:
// AppointmentsModule exports APPOINTMENT_REPOSITORY (overlap check + save).
import { AppointmentsModule } from '../appointments/appointments.module';
// ConsultationsModule exports CreateConsultationUseCase (auto-create consultation).
import { ConsultationsModule } from '../consultations/consultations.module';
// DoctorSettingsModule exports DOCTOR_PROFILE_REPOSITORY (doctor name for public info).
import { DoctorSettingsModule } from '../doctor-settings/doctor-settings.module';
// PatientsModule exports PATIENT_REPOSITORY — needed by CreateDoctorPendingConsultationsUseCase.
import { PatientsModule } from '../patients/patients.module';
// PackagesModule exports PRICING_PLAN_REPOSITORY — needed by CreateDoctorPendingConsultationsUseCase.
import { PackagesModule } from '../packages/packages.module';
// EmailModule exports MailerService — needed by DispatchPendingConsultationRemindersUseCase.
import { EmailModule } from '../email/email.module';

/**
 * PendingConsultationsModule
 *
 * Owns the lifecycle of "consultas por agendar" (pending consultations):
 *   - Creation (bulk) when a patient buys a multi-session service.
 *   - Scheduling (creates appointment + consultation).
 *   - Cancellation and expiry.
 *   - Public token-based scheduling for the patient.
 *
 * NOTE: Sequelize is NOT declared in providers — it is resolved from the
 * root SequelizeModule and injected via the constructor in repository classes.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([PendingConsultationModel]),
    // Exports APPOINTMENT_REPOSITORY + AppointmentConfirmTokenService
    AppointmentsModule,
    // Exports CreateConsultationUseCase (optional, best-effort)
    ConsultationsModule,
    // Exports DOCTOR_PROFILE_REPOSITORY for doctor name resolution on public endpoint
    DoctorSettingsModule,
    // Exports PATIENT_REPOSITORY for anti-IDOR patient ownership check
    PatientsModule,
    // Exports PRICING_PLAN_REPOSITORY for plan ownership check + validityDays resolution
    PackagesModule,
    // Exports MailerService for DispatchPendingConsultationRemindersUseCase
    EmailModule,
  ],
  controllers: [DoctorPendingConsultationsController, PublicPendingConsultationsController],
  providers: [
    // Repository binding
    {
      provide: PENDING_CONSULTATION_REPOSITORY,
      useClass: SequelizePendingConsultationRepository,
    },

    // Infrastructure service
    PendingConsultationTokenService,

    // Use cases
    GetDoctorPendingConsultationsUseCase,
    CreatePendingConsultationsUseCase,
    CreateDoctorPendingConsultationsUseCase,
    CancelPendingConsultationUseCase,
    ExpireDuePendingConsultationsUseCase,
    SchedulePendingConsultationUseCase,
    GetPendingConsultationByTokenUseCase,
    SchedulePendingConsultationByTokenUseCase,
    DispatchPendingConsultationRemindersUseCase,
  ],
  // Export use cases and repository so consuming modules (BookingModule, RemindersModule)
  // can inject them without re-registering providers.
  exports: [
    PENDING_CONSULTATION_REPOSITORY,
    CreatePendingConsultationsUseCase,
    ExpireDuePendingConsultationsUseCase,
    DispatchPendingConsultationRemindersUseCase,
    PendingConsultationTokenService,
  ],
})
export class PendingConsultationsModule {}
