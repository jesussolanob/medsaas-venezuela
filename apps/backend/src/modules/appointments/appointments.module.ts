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
import { GetAppointment360UseCase } from './application/use-cases/appointments/get-appointment-360.use-case';

import { AppointmentsController } from './presentation/controllers/appointments.controller';

// Cross-module imports for cita-360 detail view (ADR-005 pattern).
// Each module exports only its repository token — no circular dependencies.
import { ConsultationsModule } from '../consultations/consultations.module';
import { FinancesModule } from '../finances/finances.module';
import { PatientsModule } from '../patients/patients.module';
import { DoctorSettingsModule } from '../doctor-settings/doctor-settings.module';
// Required by CreateAppointmentUseCase for office ownership + modality validation.
import { OfficesModule } from '../offices/offices.module';
// Required by UpdateAppointmentStatusUseCase to cancel Google Calendar events on cancellation.
// No circular dependency: IntegrationsModule does NOT import AppointmentsModule.
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [
    SequelizeModule.forFeature([AppointmentModel, AppointmentChangesLogModel]),
    // Required by GetAppointment360UseCase for cross-module joins.
    // Each module exports only its repository token — no model duplication.
    ConsultationsModule,
    FinancesModule,
    PatientsModule,
    DoctorSettingsModule,
    // Required by CreateAppointmentUseCase to validate office ownership/modality.
    OfficesModule,
    // Exports CancelCalendarEventUseCase for cancelling Google Calendar events
    // when an appointment is cancelled via UpdateAppointmentStatusUseCase.
    IntegrationsModule,
  ],
  controllers: [AppointmentsController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: APPOINTMENT_REPOSITORY,
      useClass: SequelizeAppointmentRepository,
    },
    // Use cases
    CreateAppointmentUseCase,
    UpdateAppointmentStatusUseCase,
    GetDoctorAgendaUseCase,
    GetAppointmentByIdUseCase,
    RescheduleAppointmentUseCase,
    GetAppointment360UseCase,
  ],
  exports: [APPOINTMENT_REPOSITORY],
})
export class AppointmentsModule {}
