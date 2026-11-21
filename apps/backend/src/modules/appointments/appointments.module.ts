import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { AppointmentModel } from './infrastructure/database/models/appointment.model';
import { AppointmentChangesLogModel } from './infrastructure/database/models/appointment-changes-log.model';
import { SequelizeAppointmentRepository } from './infrastructure/database/repositories/sequelize-appointment.repository';
import { APPOINTMENT_REPOSITORY } from './domain/repositories/appointment.repository';

// GetAvailableSlotsUseCase deps — provided here to avoid the circular dependency
// AppointmentsModule → BookingModule → PendingConsultationsModule → AppointmentsModule.
// OFFICE_REPOSITORY comes from OfficesModule (already imported below).
// AVAILABILITY_BLOCK_REPOSITORY comes from AvailabilityBlocksModule (imported below).
// BOOKING_DOCTOR_LOADER, ProfileModel, DOCTOR_SCHEDULE_REPOSITORY, and DoctorScheduleModel
// are bound directly here (DoctorSettingsModule does NOT export DOCTOR_SCHEDULE_REPOSITORY).
import { GetAvailableSlotsUseCase } from '../booking/application/use-cases/booking/get-available-slots.use-case';
import { BOOKING_DOCTOR_LOADER } from '../booking/domain/repositories/booking-doctor.repository';
import { SequelizeBookingDoctorRepository } from '../booking/infrastructure/database/repositories/sequelize-booking-doctor.repository';
import { ProfileModel } from '../booking/infrastructure/database/models/profile.model';
import { DOCTOR_SCHEDULE_REPOSITORY } from '../doctor-settings/domain/repositories/doctor-schedule.repository';
import { SequelizeDoctorScheduleRepository } from '../doctor-settings/infrastructure/database/repositories/sequelize-doctor-schedule.repository';
import { DoctorScheduleModel } from '../doctor-settings/infrastructure/database/models/doctor-schedule.model';

import { CreateAppointmentUseCase } from './application/use-cases/appointments/create-appointment.use-case';
import { UpdateAppointmentStatusUseCase } from './application/use-cases/appointments/update-appointment-status.use-case';
import { GetDoctorAgendaUseCase } from './application/use-cases/appointments/get-doctor-agenda.use-case';
import { GetAppointmentByIdUseCase } from './application/use-cases/appointments/get-appointment-by-id.use-case';
import { RescheduleAppointmentUseCase } from './application/use-cases/appointments/reschedule-appointment.use-case';
import { DeleteAppointmentUseCase } from './application/use-cases/appointments/delete-appointment.use-case';
import { ConfirmAppointmentByTokenUseCase } from './application/use-cases/appointments/confirm-appointment-by-token.use-case';
import { GetAppointmentConfirmInfoUseCase } from './application/use-cases/appointments/get-appointment-confirm-info.use-case';
import { SyncDoctorCalendarUseCase } from './application/use-cases/appointments/sync-doctor-calendar.use-case';
import { ChangeAppointmentServiceUseCase } from './application/use-cases/appointments/change-appointment-service.use-case';
import { RescheduleByTokenUseCase } from './application/use-cases/appointments/reschedule-by-token.use-case';

import { AppointmentsController } from './presentation/controllers/appointments.controller';
import { PublicAppointmentsController } from './presentation/controllers/public-appointments.controller';

import { AppointmentConfirmTokenService } from './infrastructure/services/appointment-confirm-token.service';
import { AppointmentRescheduleTokenService } from './infrastructure/services/appointment-reschedule-token.service';

// Required by CreateAppointmentUseCase for office ownership + modality validation.
import { OfficesModule } from '../offices/offices.module';
// Required by UpdateAppointmentStatusUseCase to cancel Google Calendar events on cancellation.
// No circular dependency: IntegrationsModule does NOT import AppointmentsModule.
import { IntegrationsModule } from '../integrations/integrations.module';
// Required by CreateAppointmentUseCase and UpdateAppointmentStatusUseCase to
// auto-create a consultation when an appointment is confirmed.
// No circular dependency: ConsultationsModule does NOT import AppointmentsModule.
import { ConsultationsModule } from '../consultations/consultations.module';
// Required by ConfirmAppointmentByTokenUseCase and GetAppointmentConfirmInfoUseCase
// to resolve the doctor display name for the public confirmation page.
import { DoctorSettingsModule } from '../doctor-settings/doctor-settings.module';
// PackagesModule exports PRICING_PLAN_REPOSITORY (catálogo de servicios del especialista).
import { PackagesModule } from '../packages/packages.module';
// AvailabilityBlocksModule exports AVAILABILITY_BLOCK_REPOSITORY for GetAvailableSlotsUseCase.
// No circular dependency: AvailabilityBlocksModule only imports SequelizeModule.
import { AvailabilityBlocksModule } from '../availability-blocks/availability-blocks.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      AppointmentModel,
      AppointmentChangesLogModel,
      // ProfileModel — used by SequelizeBookingDoctorRepository (BOOKING_DOCTOR_LOADER)
      // for GetAvailableSlotsUseCase's anti-enumeration guard.
      ProfileModel,
      // DoctorScheduleModel — used by SequelizeDoctorScheduleRepository
      // (DOCTOR_SCHEDULE_REPOSITORY) for GetAvailableSlotsUseCase horizon check.
      // DoctorSettingsModule does NOT export DOCTOR_SCHEDULE_REPOSITORY, so it must
      // be bound directly here (same pattern as BookingModule).
      DoctorScheduleModel,
    ]),
    // Required by CreateAppointmentUseCase to validate office ownership/modality.
    // Also provides OFFICE_REPOSITORY for GetAvailableSlotsUseCase.
    OfficesModule,
    // Exports CancelCalendarEventUseCase for cancelling Google Calendar events
    // when an appointment is cancelled via UpdateAppointmentStatusUseCase.
    IntegrationsModule,
    // Exports CONSULTATION_REPOSITORY and CreateConsultationUseCase for
    // auto-creating consultations on appointment confirmation.
    ConsultationsModule,
    // Exports DOCTOR_PROFILE_REPOSITORY for resolving doctor name on public confirm page.
    // NOTE: does NOT export DOCTOR_SCHEDULE_REPOSITORY — that is bound directly in providers.
    DoctorSettingsModule,
    // Exports PRICING_PLAN_REPOSITORY for ChangeAppointmentServiceUseCase: corregir el
    // servicio exige leer el catálogo (que exista, que sea del doctor, y su sessions_count).
    PackagesModule,
    // Exports AVAILABILITY_BLOCK_REPOSITORY for GetAvailableSlotsUseCase (block filtering).
    // No circular dependency: AvailabilityBlocksModule only imports SequelizeModule.
    AvailabilityBlocksModule,
  ],
  controllers: [AppointmentsController, PublicAppointmentsController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: APPOINTMENT_REPOSITORY,
      useClass: SequelizeAppointmentRepository,
    },
    // BOOKING_DOCTOR_LOADER — read-only profile lookup used by GetAvailableSlotsUseCase.
    // Bound directly here to avoid importing BookingModule (which would create a cycle via
    // BookingModule → PendingConsultationsModule → AppointmentsModule).
    {
      provide: BOOKING_DOCTOR_LOADER,
      useClass: SequelizeBookingDoctorRepository,
    },
    // DOCTOR_SCHEDULE_REPOSITORY — horizon check in GetAvailableSlotsUseCase.
    // DoctorSettingsModule does NOT export this token; bound directly (same as BookingModule).
    {
      provide: DOCTOR_SCHEDULE_REPOSITORY,
      useClass: SequelizeDoctorScheduleRepository,
    },
    // Infrastructure services: stateless HMAC tokens.
    AppointmentConfirmTokenService,
    AppointmentRescheduleTokenService,
    // GetAvailableSlotsUseCase — used by RescheduleByTokenUseCase to validate that the
    // requested new scheduledAt is an actual slot in the doctor's public booking grid.
    GetAvailableSlotsUseCase,
    // Use cases
    CreateAppointmentUseCase,
    UpdateAppointmentStatusUseCase,
    GetDoctorAgendaUseCase,
    GetAppointmentByIdUseCase,
    RescheduleAppointmentUseCase,
    DeleteAppointmentUseCase,
    ConfirmAppointmentByTokenUseCase,
    ChangeAppointmentServiceUseCase,
    GetAppointmentConfirmInfoUseCase,
    SyncDoctorCalendarUseCase,
    RescheduleByTokenUseCase,
  ],
  exports: [
    APPOINTMENT_REPOSITORY,
    AppointmentConfirmTokenService,
    AppointmentRescheduleTokenService,
  ],
})
export class AppointmentsModule {}
