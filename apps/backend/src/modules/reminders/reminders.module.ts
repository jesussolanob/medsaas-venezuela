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

import { DoctorRemindersController } from './presentation/controllers/doctor-reminders.controller';
import { AdminRemindersController } from './presentation/controllers/admin-reminders.controller';

/**
 * RemindersModule — Doctor reminder configuration + queue monitoring.
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature models here — never re-declare the Sequelize
 * provider in this module's providers array (that causes a dist boot crash).
 *
 * Sending logic (WhatsApp / email) is deferred to Fase 6.
 * This module only persists / reads config and exposes the queue for monitoring.
 */
@Module({
  imports: [SequelizeModule.forFeature([RemindersSettingsModel, RemindersQueueModel])],
  controllers: [DoctorRemindersController, AdminRemindersController],
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
  ],
})
export class RemindersModule {}
