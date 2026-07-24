import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Infrastructure models
import { ProfileModel } from './infrastructure/database/models/profile.model';
// Reuse doctor-settings models for plan_configs and plan_features tables
// (same DB tables — BookingModule does not own these tables, only reads them).
import { PlanConfigDoctorModel } from '../doctor-settings/infrastructure/database/models/plan-config-doctor.model';
import { PlanFeaturesModel } from '../doctor-settings/infrastructure/database/models/plan-features.model';

// Repository implementation + token
import { SequelizeBookingDoctorRepository } from './infrastructure/database/repositories/sequelize-booking-doctor.repository';
import { BOOKING_DOCTOR_LOADER } from './domain/repositories/booking-doctor.repository';
import { SequelizeBookingFeatureChecker } from './infrastructure/database/repositories/sequelize-booking-feature-checker.repository';
import { BOOKING_FEATURE_CHECKER } from './domain/repositories/booking-feature-checker.repository';

// Use cases
import { CreateBookingUseCase } from './application/use-cases/booking/create-booking.use-case';
import { GetBookingDoctorInfoUseCase } from './application/use-cases/booking/get-booking-doctor-info.use-case';
import { GetBookingPlansUseCase } from './application/use-cases/booking/get-booking-plans.use-case';
import { GetBookingPackagesUseCase } from './application/use-cases/booking/get-booking-packages.use-case';
import { GetAvailableSlotsUseCase } from './application/use-cases/booking/get-available-slots.use-case';
import { GetBookingOfficesUseCase } from './application/use-cases/booking/get-booking-offices.use-case';

// Controllers
import { BookingController } from './presentation/controllers/booking.controller';
import { DoctorBookingController } from './presentation/controllers/doctor-booking.controller';

// PackagesModule exports PACKAGE_REPOSITORY, PRICING_PLAN_REPOSITORY, ConsumePackageSessionUseCase.
// PatientsModule exports PATIENT_REPOSITORY.
import { PackagesModule } from '../packages/packages.module';
import { PatientsModule } from '../patients/patients.module';
// FinancesModule exports PAYMENT_REPOSITORY for CreateBookingUseCase.
import { FinancesModule } from '../finances/finances.module';
// PatientIdentitiesModule exports ResolvePatientIdentityUseCase (internal analytics only).
import { PatientIdentitiesModule } from '../patient-identities/patient-identities.module';
// IntegrationsModule exports AppointmentNotificationService and CreateCalendarEventUseCase.
import { IntegrationsModule } from '../integrations/integrations.module';

// APPOINTMENT_REPOSITORY binding for CreateBookingUseCase + GetAvailableSlotsUseCase.
import { APPOINTMENT_REPOSITORY } from '../appointments/domain/repositories/appointment.repository';
import { SequelizeAppointmentRepository } from '../appointments/infrastructure/database/repositories/sequelize-appointment.repository';
import { AppointmentModel } from '../appointments/infrastructure/database/models/appointment.model';
import { AppointmentChangesLogModel } from '../appointments/infrastructure/database/models/appointment-changes-log.model';

// OfficesModule exports OFFICE_REPOSITORY for GetAvailableSlotsUseCase.
// Slots are now generated from doctor_offices (active offices + their schedule),
// replacing the legacy doctor_schedules approach.
import { OfficesModule } from '../offices/offices.module';

// AvailabilityBlocksModule exports AVAILABILITY_BLOCK_REPOSITORY for slot filtering.
import { AvailabilityBlocksModule } from '../availability-blocks/availability-blocks.module';
// StorageModule exports STORAGE_PORT, used by GetBookingDoctorInfoUseCase to re-sign
// GCS avatar URLs at read time so the booking widget always displays fresh images.
import { StorageModule } from '../storage/storage.module';
// ConsultationsModule exports CreateConsultationUseCase for auto-creating consultations after booking.
// No circular dependency: ConsultationsModule does NOT import BookingModule.
import { ConsultationsModule } from '../consultations/consultations.module';
// PendingConsultationsModule exports CreatePendingConsultationsUseCase for the A1b multi-session path.
// No circular dependency: PendingConsultationsModule does NOT import BookingModule.
import { PendingConsultationsModule } from '../pending-consultations/pending-consultations.module';

// DOCTOR_SCHEDULE_REPOSITORY for horizon check in GetAvailableSlotsUseCase.
import { DOCTOR_SCHEDULE_REPOSITORY } from '../doctor-settings/domain/repositories/doctor-schedule.repository';
import { SequelizeDoctorScheduleRepository } from '../doctor-settings/infrastructure/database/repositories/sequelize-doctor-schedule.repository';
import { DoctorScheduleModel } from '../doctor-settings/infrastructure/database/models/doctor-schedule.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      ProfileModel,
      AppointmentModel,
      AppointmentChangesLogModel,
      DoctorScheduleModel,
      // plan_configs and plan_features are owned by DoctorSettingsModule but read
      // here by SequelizeBookingFeatureChecker for effective-plan resolution.
      // Note: OfficeModel is registered inside OfficesModule — do NOT re-register it here.
      PlanConfigDoctorModel,
      PlanFeaturesModel,
    ]),
    PackagesModule,
    PatientsModule,
    // FinancesModule provides PAYMENT_REPOSITORY for CreateBookingUseCase.
    // This creates the payment record atomically during booking.
    FinancesModule,
    // OfficesModule exports OFFICE_REPOSITORY used by GetAvailableSlotsUseCase.
    OfficesModule,
    // PatientIdentitiesModule provides ResolvePatientIdentityUseCase for
    // populating identity_id on new patients created during booking.
    PatientIdentitiesModule,
    // IntegrationsModule provides AppointmentNotificationService (calendar invites
    // + .ics + email) and CreateCalendarEventUseCase for Google Meet / Jitsi fallback.
    IntegrationsModule,
    // AvailabilityBlocksModule exports AVAILABILITY_BLOCK_REPOSITORY for slot filtering.
    AvailabilityBlocksModule,
    // ConsultationsModule exports CreateConsultationUseCase for auto-creating consultations
    // after a public booking is completed (non-fatal, best-effort).
    ConsultationsModule,
    // PendingConsultationsModule exports CreatePendingConsultationsUseCase + PENDING_CONSULTATION_REPOSITORY.
    // Used by CreateBookingUseCase for the multi-session path (A1b). When plan_id is absent
    // or sessionsCount=1, these dependencies are never invoked — backward compat guaranteed.
    PendingConsultationsModule,
    // StorageModule provides STORAGE_PORT for GCS URL re-signing in GetBookingDoctorInfoUseCase.
    StorageModule,
  ],
  controllers: [BookingController, DoctorBookingController],
  providers: [
    // Doctor loader (read-only profile lookup for public booking)
    {
      provide: BOOKING_DOCTOR_LOADER,
      useClass: SequelizeBookingDoctorRepository,
    },

    // Booking feature checker — resolves effective plan and checks booking feature flag
    {
      provide: BOOKING_FEATURE_CHECKER,
      useClass: SequelizeBookingFeatureChecker,
    },

    // Appointment repository binding (CreateBookingUseCase + GetAvailableSlotsUseCase)
    {
      provide: APPOINTMENT_REPOSITORY,
      useClass: SequelizeAppointmentRepository,
    },

    // Doctor schedule repository binding — used only for horizon check in GetAvailableSlotsUseCase
    {
      provide: DOCTOR_SCHEDULE_REPOSITORY,
      useClass: SequelizeDoctorScheduleRepository,
    },

    // Use cases
    CreateBookingUseCase,
    GetBookingDoctorInfoUseCase,
    GetBookingPlansUseCase,
    GetBookingPackagesUseCase,
    GetAvailableSlotsUseCase,
    GetBookingOfficesUseCase,
  ],
})
export class BookingModule {}
