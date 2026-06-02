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

import { AppointmentsController } from './presentation/controllers/appointments.controller';

@Module({
  imports: [SequelizeModule.forFeature([AppointmentModel, AppointmentChangesLogModel])],
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
  ],
})
export class AppointmentsModule {}
