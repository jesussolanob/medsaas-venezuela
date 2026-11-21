import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { WHATSAPP_SENDER } from './domain/ports/iwhatsapp-sender.port';
import { ZernioWhatsAppSenderAdapter } from './infrastructure/adapters/zernio-whatsapp-sender.adapter';
import { AppointmentActionTokenService } from './infrastructure/services/appointment-action-token.service';

import { HandleWhatsAppWebhookUseCase } from './application/use-cases/handle-whatsapp-webhook.use-case';
import { SendTestWhatsAppReminderUseCase } from './application/use-cases/send-test-whatsapp-reminder.use-case';

import { WhatsAppWebhookController } from './presentation/controllers/whatsapp-webhook.controller';
import { AdminWhatsAppTestController } from './presentation/controllers/admin-whatsapp-test.controller';

// Cross-module dependencies
import { AppointmentsModule } from '../appointments/appointments.module';
import { DoctorSettingsModule } from '../doctor-settings/doctor-settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AppointmentRescheduleTokenService } from '../appointments/infrastructure/services/appointment-reschedule-token.service';

/**
 * WhatsAppModule — WhatsApp adapter, webhook handling, and test endpoint.
 *
 * IMPORTANT: Sequelize is provided globally. Never add it to this module's providers.
 *
 * Dependency design to avoid circular imports:
 *   - DispatchWhatsAppRemindersUseCase is NOT here — it lives in RemindersModule
 *     because it needs REMINDERS_QUEUE_REPOSITORY. RemindersModule imports WhatsAppModule
 *     to get WHATSAPP_SENDER and AppointmentActionTokenService.
 *   - This module only knows about AppointmentsModule, DoctorSettingsModule, and
 *     NotificationsModule. No cycle.
 *
 * Exports:
 *   - WHATSAPP_SENDER  → available to RemindersModule for DispatchWhatsAppRemindersUseCase
 *   - AppointmentActionTokenService → available to RemindersModule for button generation
 *
 * Dependencies satisfied by imports:
 *   - APPOINTMENT_REPOSITORY → AppointmentsModule (exported)
 *   - AppointmentRescheduleTokenService → AppointmentsModule (exported, re-provided here
 *     so NestJS resolves it without requesting another module import)
 *   - DOCTOR_PROFILE_REPOSITORY → DoctorSettingsModule (exported)
 *   - CreateNotificationUseCase → NotificationsModule (exported)
 *   - ConfigService → global (registered in AppModule)
 */
@Module({
  imports: [ConfigModule, AppointmentsModule, DoctorSettingsModule, NotificationsModule],
  controllers: [WhatsAppWebhookController, AdminWhatsAppTestController],
  providers: [
    // Port binding: domain interface → infrastructure implementation
    {
      provide: WHATSAPP_SENDER,
      useClass: ZernioWhatsAppSenderAdapter,
    },

    // Infrastructure services
    AppointmentActionTokenService,
    // AppointmentRescheduleTokenService is exported from AppointmentsModule and
    // is available via that import.  We re-declare it here so NestJS resolves
    // the constructor parameter without an extra module import.
    AppointmentRescheduleTokenService,

    // Use cases (no queue dependency)
    HandleWhatsAppWebhookUseCase,
    SendTestWhatsAppReminderUseCase,
  ],
  exports: [WHATSAPP_SENDER, AppointmentActionTokenService],
})
export class WhatsAppModule {}
