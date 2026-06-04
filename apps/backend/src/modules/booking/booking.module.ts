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

// APPOINTMENT_REPOSITORY binding for CreateBookingUseCase + GetAvailableSlotsUseCase.
import { APPOINTMENT_REPOSITORY } from '../appointments/domain/repositories/appointment.repository';
import { SequelizeAppointmentRepository } from '../appointments/infrastructure/database/repositories/sequelize-appointment.repository';
import { AppointmentModel } from '../appointments/infrastructure/database/models/appointment.model';
import { AppointmentChangesLogModel } from '../appointments/infrastructure/database/models/appointment-changes-log.model';

// DOCTOR_SCHEDULE_REPOSITORY binding for GetAvailableSlotsUseCase.
// Declared locally to avoid importing DoctorSettingsModule (which re-registers PricingPlanModel,
// already registered by PackagesModule → model collision crash on dist boot).
import { DOCTOR_SCHEDULE_REPOSITORY } from '../doctor-settings/domain/repositories/doctor-schedule.repository';
import { SequelizeDoctorScheduleRepository } from '../doctor-settings/infrastructure/database/repositories/sequelize-doctor-schedule.repository';
import { DoctorScheduleModel } from '../doctor-settings/infrastructure/database/models/doctor-schedule.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      ProfileModel,
      AppointmentModel,
      AppointmentChangesLogModel,
      // DoctorScheduleModel is safe to register here — it is not registered by any module
      // that BookingModule transitively imports (PackagesModule, PatientsModule, FinancesModule).
      DoctorScheduleModel,
    ]),
    PackagesModule,
    PatientsModule,
    // FinancesModule provides PAYMENT_REPOSITORY for CreateBookingUseCase.
    // This creates the payment record atomically during booking.
    FinancesModule,
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

    // Doctor schedule repository binding (GetAvailableSlotsUseCase)
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
  ],
})
export class BookingModule {}
