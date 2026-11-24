import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';

import { WHATSAPP_SENDER } from './domain/ports/iwhatsapp-sender.port';
import { ZernioWhatsAppSenderAdapter } from './infrastructure/adapters/zernio-whatsapp-sender.adapter';

import { HandleWhatsAppWebhookUseCase } from './application/use-cases/handle-whatsapp-webhook.use-case';
import { SendTestWhatsAppReminderUseCase } from './application/use-cases/send-test-whatsapp-reminder.use-case';

import { WhatsAppWebhookController } from './presentation/controllers/whatsapp-webhook.controller';
import { AdminWhatsAppTestController } from './presentation/controllers/admin-whatsapp-test.controller';

// REMINDERS_QUEUE_REPOSITORY — bound directly here (not via RemindersModule import)
// to avoid a circular dependency: RemindersModule imports WhatsAppModule, so
// importing RemindersModule here would create a cycle.
import { REMINDERS_QUEUE_REPOSITORY } from '../reminders/domain/repositories/reminders-queue.repository';
import { RemindersQueueModel } from '../reminders/infrastructure/database/models/reminders-queue.model';
import { SequelizeRemindersQueueRepository } from '../reminders/infrastructure/database/repositories/sequelize-reminders-queue.repository';

// Cross-module dependencies
import { AppointmentsModule } from '../appointments/appointments.module';
import { DoctorSettingsModule } from '../doctor-settings/doctor-settings.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * WhatsAppModule — WhatsApp adapter, webhook handling, and test endpoint.
 *
 * IMPORTANT: Sequelize is provided globally. Never add it to this module's providers.
 *
 * Dependency design to avoid circular imports:
 *   - DispatchWhatsAppRemindersUseCase is NOT here — it lives in RemindersModule
 *     because it needs REMINDERS_QUEUE_REPOSITORY. RemindersModule imports WhatsAppModule
 *     to get WHATSAPP_SENDER.
 *   - HandleWhatsAppWebhookUseCase ALSO needs REMINDERS_QUEUE_REPOSITORY (to look up
 *     the appointment from metadata.quotedMessageId). We bind it directly here using
 *     RemindersQueueModel + SequelizeRemindersQueueRepository rather than importing
 *     RemindersModule, which would create a circular dependency.
 *   - This module only knows about AppointmentsModule, DoctorSettingsModule, and
 *     NotificationsModule. No cycle.
 *
 * Exports:
 *   - WHATSAPP_SENDER  → available to RemindersModule for DispatchWhatsAppRemindersUseCase
 *
 * Dependencies satisfied by imports:
 *   - APPOINTMENT_REPOSITORY → AppointmentsModule (exported)
 *   - AppointmentRescheduleTokenService → AppointmentsModule (exported; available
 *     directly in this module's scope via the AppointmentsModule import — no re-declaration)
 *   - DOCTOR_PROFILE_REPOSITORY → DoctorSettingsModule (exported)
 *   - CreateNotificationUseCase → NotificationsModule (exported)
 *   - ConfigService → global (registered in AppModule)
 */
@Module({
  imports: [
    ConfigModule,
    SequelizeModule.forFeature([RemindersQueueModel]),
    AppointmentsModule,
    DoctorSettingsModule,
    NotificationsModule,
  ],
  controllers: [WhatsAppWebhookController, AdminWhatsAppTestController],
  providers: [
    // Port binding: domain interface → infrastructure implementation
    {
      provide: WHATSAPP_SENDER,
      useClass: ZernioWhatsAppSenderAdapter,
    },

    // REMINDERS_QUEUE_REPOSITORY — bound locally to avoid RemindersModule circular dep.
    {
      provide: REMINDERS_QUEUE_REPOSITORY,
      useClass: SequelizeRemindersQueueRepository,
    },

    // Use cases
    HandleWhatsAppWebhookUseCase,
    SendTestWhatsAppReminderUseCase,
  ],
  exports: [WHATSAPP_SENDER],
})
export class WhatsAppModule {}
