import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { AppointmentModel } from './infrastructure/database/models/appointment.model';
import { AppointmentChangesLogModel } from './infrastructure/database/models/appointment-changes-log.model';
import { SequelizeAppointmentRepository } from './infrastructure/database/repositories/sequelize-appointment.repository';
import { APPOINTMENT_REPOSITORY } from './domain/repositories/appointment.repository';

import { CreateAppointmentUseCase } from './application/use-cases/appointments/create-appointment.use-case';
import { UpdateAppointmentStatusUseCase } from './application/use-cases/appointments/update-appointment-status.use-case';
import { GetDoctorAgendaUseCase } from './application/use-cases/appointments/get-doctor-agenda.use-case';
import { GetAppointmentByIdUseCase } from './application/use-cases/appointments/get-appointment-by-id.use-case';
import { RescheduleAppointmentUseCase } from './application/use-cases/appointments/reschedule-appointment.use-case';
import { DeleteAppointmentUseCase } from './application/use-cases/appointments/delete-appointment.use-case';
import { ConfirmAppointmentByTokenUseCase } from './application/use-cases/appointments/confirm-appointment-by-token.use-case';
import { GetAppointmentConfirmInfoUseCase } from './application/use-cases/appointments/get-appointment-confirm-info.use-case';
import { SyncDoctorCalendarUseCase } from './application/use-cases/appointments/sync-doctor-calendar.use-case';

import { AppointmentsController } from './presentation/controllers/appointments.controller';
import { PublicAppointmentsController } from './presentation/controllers/public-appointments.controller';

import { AppointmentConfirmTokenService } from './infrastructure/services/appointment-confirm-token.service';

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

@Module({
  imports: [
    SequelizeModule.forFeature([AppointmentModel, AppointmentChangesLogModel]),
    // Required by CreateAppointmentUseCase to validate office ownership/modality.
    OfficesModule,
    // Exports CancelCalendarEventUseCase for cancelling Google Calendar events
    // when an appointment is cancelled via UpdateAppointmentStatusUseCase.
    IntegrationsModule,
    // Exports CONSULTATION_REPOSITORY and CreateConsultationUseCase for
    // auto-creating consultations on appointment confirmation.
    ConsultationsModule,
    // Exports DOCTOR_PROFILE_REPOSITORY for resolving doctor name on public confirm page.
    DoctorSettingsModule,
  ],
  controllers: [AppointmentsController, PublicAppointmentsController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: APPOINTMENT_REPOSITORY,
      useClass: SequelizeAppointmentRepository,
    },
    // Infrastructure service: stateless HMAC token for appointment confirmation.
    AppointmentConfirmTokenService,
    // Use cases
    CreateAppointmentUseCase,
    UpdateAppointmentStatusUseCase,
    GetDoctorAgendaUseCase,
    GetAppointmentByIdUseCase,
    RescheduleAppointmentUseCase,
    DeleteAppointmentUseCase,
    ConfirmAppointmentByTokenUseCase,
    GetAppointmentConfirmInfoUseCase,
    SyncDoctorCalendarUseCase,
  ],
  exports: [APPOINTMENT_REPOSITORY, AppointmentConfirmTokenService],
})
export class AppointmentsModule {}
