import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Infrastructure models
import { ProfileModel } from './infrastructure/database/models/profile.model';

// Repository implementation + token
import { SequelizeBookingDoctorRepository } from './infrastructure/database/repositories/sequelize-booking-doctor.repository';
import { BOOKING_DOCTOR_LOADER } from './domain/repositories/booking-doctor.repository';

// Use cases
import { CreateBookingUseCase } from './application/use-cases/booking/create-booking.use-case';
import { GetBookingDoctorInfoUseCase } from './application/use-cases/booking/get-booking-doctor-info.use-case';
import { GetBookingPlansUseCase } from './application/use-cases/booking/get-booking-plans.use-case';
import { GetBookingPackagesUseCase } from './application/use-cases/booking/get-booking-packages.use-case';
import { GetAvailableSlotsUseCase } from './application/use-cases/booking/get-available-slots.use-case';

// Controller
import { BookingController } from './presentation/controllers/booking.controller';

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

@Module({
  imports: [
    SequelizeModule.forFeature([
      ProfileModel,
      AppointmentModel,
      AppointmentChangesLogModel,
      // Note: OfficeModel is registered inside OfficesModule — do NOT re-register it here.
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
  ],
  controllers: [BookingController],
  providers: [
    // Doctor loader (read-only profile lookup for public booking)
    {
      provide: BOOKING_DOCTOR_LOADER,
      useClass: SequelizeBookingDoctorRepository,
    },

    // Appointment repository binding (CreateBookingUseCase + GetAvailableSlotsUseCase)
    {
      provide: APPOINTMENT_REPOSITORY,
      useClass: SequelizeAppointmentRepository,
    },

    // Use cases
    CreateBookingUseCase,
    GetBookingDoctorInfoUseCase,
    GetBookingPlansUseCase,
    GetBookingPackagesUseCase,
    GetAvailableSlotsUseCase,
  ],
})
export class BookingModule {}
