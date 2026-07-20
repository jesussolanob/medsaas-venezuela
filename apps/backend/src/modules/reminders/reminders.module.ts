import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { RemindersSettingsModel } from './infrastructure/database/models/reminders-settings.model';
import { RemindersQueueModel } from './infrastructure/database/models/reminders-queue.model';
import { SequelizeRemindersSettingsRepository } from './infrastructure/database/repositories/sequelize-reminders-settings.repository';
import { SequelizeRemindersQueueRepository } from './infrastructure/database/repositories/sequelize-reminders-queue.repository';
import { REMINDERS_SETTINGS_REPOSITORY } from './domain/repositories/reminders-settings.repository';
import { REMINDERS_QUEUE_REPOSITORY } from './domain/repositories/reminders-queue.repository';

import { GetRemindersSettingsUseCase } from './application/use-cases/reminders/get-reminders-settings.use-case';
import { UpsertRemindersSettingsUseCase } from './application/use-cases/reminders/upsert-reminders-settings.use-case';
import { GetDoctorRemindersQueueUseCase } from './application/use-cases/reminders/get-doctor-reminders-queue.use-case';
import { GetAdminRemindersQueueUseCase } from './application/use-cases/reminders/get-admin-reminders-queue.use-case';
import { SendAppointmentReminderEmailUseCase } from './application/use-cases/reminders/send-appointment-reminder-email.use-case';
import { DispatchDueRemindersUseCase } from './application/use-cases/reminders/dispatch-due-reminders.use-case';

import { DoctorRemindersController } from './presentation/controllers/doctor-reminders.controller';
import { AdminRemindersController } from './presentation/controllers/admin-reminders.controller';
import { CronRemindersController } from './presentation/controllers/cron-reminders.controller';

// Cross-module dependencies for SendAppointmentReminderEmailUseCase
import { AppointmentsModule } from '../appointments/appointments.module';
import { ConsultationsModule } from '../consultations/consultations.module';
import { PatientsModule } from '../patients/patients.module';
import { DoctorSettingsModule } from '../doctor-settings/doctor-settings.module';
import { EmailModule } from '../email/email.module';

/**
 * RemindersModule — Doctor reminder configuration + queue monitoring + cron dispatch.
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature models here — never re-declare the Sequelize
 * provider in this module's providers array (that causes a dist boot crash).
 *
 * DispatchDueRemindersUseCase requires:
 *   - REMINDERS_QUEUE_REPOSITORY → registered locally
 *   - DOCTOR_PROFILE_REPOSITORY  → DoctorSettingsModule (exported)
 *   - MailerService              → EmailModule (exported)
 *   - AppointmentConfirmTokenService → AppointmentsModule (exported)
 *   - ConfigService              → global (registered in AppModule)
 *
 * SendAppointmentReminderEmailUseCase requires:
 *   - APPOINTMENT_REPOSITORY  → AppointmentsModule (exported)
 *   - CONSULTATION_REPOSITORY → ConsultationsModule (exported)
 *   - PATIENT_REPOSITORY      → PatientsModule (exported)
 *   - DOCTOR_PROFILE_REPOSITORY → DoctorSettingsModule (exported)
 *   - MailerService           → EmailModule (exported)
 */
@Module({
  imports: [
    SequelizeModule.forFeature([RemindersSettingsModel, RemindersQueueModel]),
    AppointmentsModule,
    ConsultationsModule,
    PatientsModule,
    DoctorSettingsModule,
    EmailModule,
  ],
  controllers: [DoctorRemindersController, AdminRemindersController, CronRemindersController],
  providers: [
    // Repository bindings: domain interface → Sequelize implementation
    {
      provide: REMINDERS_SETTINGS_REPOSITORY,
      useClass: SequelizeRemindersSettingsRepository,
    },
    {
      provide: REMINDERS_QUEUE_REPOSITORY,
      useClass: SequelizeRemindersQueueRepository,
    },

    // Use cases
    GetRemindersSettingsUseCase,
    UpsertRemindersSettingsUseCase,
    GetDoctorRemindersQueueUseCase,
    GetAdminRemindersQueueUseCase,
    SendAppointmentReminderEmailUseCase,
    DispatchDueRemindersUseCase,
  ],
})
export class RemindersModule {}
