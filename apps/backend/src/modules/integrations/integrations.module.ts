import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Domain
import { GOOGLE_INTEGRATION_REPOSITORY } from './domain/repositories/google-integration.repository';

// Infrastructure
import { GoogleIntegrationModel } from './infrastructure/database/models/google-integration.model';
import { SequelizeGoogleIntegrationRepository } from './infrastructure/database/repositories/sequelize-google-integration.repository';
import { GoogleCalendarService } from './infrastructure/google/google-calendar.service';

// Use cases
import { ConnectGoogleUseCase } from './application/use-cases/integrations/connect-google.use-case';
import { GetIntegrationStatusUseCase } from './application/use-cases/integrations/get-integration-status.use-case';
import { DisconnectGoogleUseCase } from './application/use-cases/integrations/disconnect-google.use-case';
import { CreateCalendarEventUseCase } from './application/use-cases/integrations/create-calendar-event.use-case';
import { CancelCalendarEventUseCase } from './application/use-cases/integrations/cancel-calendar-event.use-case';
import { UpdateCalendarEventUseCase } from './application/use-cases/integrations/update-calendar-event.use-case';

// Services
import {
  AppointmentNotificationService,
  APPOINTMENT_NOTIFICATION_SERVICE,
} from './application/services/appointment-notification.service';

// Presentation
import { IntegrationsController } from './presentation/controllers/integrations.controller';

// EmailModule provides MailerService for notification delivery
import { EmailModule } from '../email/email.module';

/**
 * IntegrationsModule — Google Calendar/Meet opt-in integration.
 *
 * ENV-GATED: if GOOGLE_CLIENT_ID/SECRET are absent, GoogleCalendarService.isConfigured()
 * returns false and the system falls back to Jitsi + .ics.
 *
 * Exports:
 *   - CreateCalendarEventUseCase — used by BookingModule
 *   - AppointmentNotificationService — used by BookingModule
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature model here.
 */
@Module({
  imports: [SequelizeModule.forFeature([GoogleIntegrationModel]), EmailModule],
  controllers: [IntegrationsController],
  providers: [
    // Repository binding
    {
      provide: GOOGLE_INTEGRATION_REPOSITORY,
      useClass: SequelizeGoogleIntegrationRepository,
    },

    // Infrastructure services
    GoogleCalendarService,

    // Use cases
    ConnectGoogleUseCase,
    GetIntegrationStatusUseCase,
    DisconnectGoogleUseCase,
    CreateCalendarEventUseCase,
    CancelCalendarEventUseCase,
    UpdateCalendarEventUseCase,

    // Application services — registered with both class and string token
    // so cross-module injection works even when TypeScript emits Object as paramtype
    AppointmentNotificationService,
    {
      provide: APPOINTMENT_NOTIFICATION_SERVICE,
      useExisting: AppointmentNotificationService,
    },
  ],
  exports: [
    CreateCalendarEventUseCase,
    CancelCalendarEventUseCase,
    UpdateCalendarEventUseCase,
    AppointmentNotificationService,
    APPOINTMENT_NOTIFICATION_SERVICE,
  ],
})
export class IntegrationsModule {}
