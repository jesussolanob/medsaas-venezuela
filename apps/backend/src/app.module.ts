import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { databaseConfig } from './infrastructure/config/database.config';
import { RedisModule } from './infrastructure/cache/redis.module';
import { CryptoModule } from './infrastructure/crypto/crypto.module';
import { HealthController } from './presentation/controllers/health.controller';
import { GlobalExceptionFilter } from './presentation/filters/global-exception.filter';
import { LoggingInterceptor } from './presentation/interceptors/logging.interceptor';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ConsultationsModule } from './modules/consultations/consultations.module';
import { EhrModule } from './modules/ehr/ehr.module';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import { PackagesModule } from './modules/packages/packages.module';
import { BookingModule } from './modules/booking/booking.module';
import { FinancesModule } from './modules/finances/finances.module';
import { DoctorSettingsModule } from './modules/doctor-settings/doctor-settings.module';
import { PatientPortalModule } from './modules/patient-portal/patient-portal.module';
import { AdminModule } from './modules/admin/admin.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { BillingModule } from './modules/billing/billing.module';
import { LeadsModule } from './modules/leads/leads.module';
import { SuggestionsModule } from './modules/suggestions/suggestions.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { ConsultationBlocksModule } from './modules/consultation-blocks/consultation-blocks.module';
import { CapabilitiesModule } from './modules/capabilities/capabilities.module';
import { OfficesModule } from './modules/offices/offices.module';
import { DoctorTemplatesModule } from './modules/doctor-templates/doctor-templates.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { StorageModule } from './modules/storage/storage.module';
import { MessagesModule } from './modules/messages/messages.module';
import { QuickItemsModule } from './modules/quick-items/quick-items.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmailModule } from './modules/email/email.module';
import { DoctorRegistrationModule } from './modules/doctor-registration/doctor-registration.module';
import { PatientIdentitiesModule } from './modules/patient-identities/patient-identities.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { AvailabilityBlocksModule } from './modules/availability-blocks/availability-blocks.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { SpecialtiesModule } from './modules/specialties/specialties.module';
import { CredentialVerificationModule } from './modules/credential-verification/credential-verification.module';
import { InfraAuthModule } from './infrastructure/auth/infra-auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/backend/.env', '.env'],
    }),
    // SentryModule wires Sentry's NestJS request-lifecycle hooks.
    // init() has already been called in instrument.ts; this merely registers
    // the NestJS integration. Safe to include even when DSN is absent.
    SentryModule.forRoot(),
    SequelizeModule.forRootAsync({ useFactory: databaseConfig }),
    RedisModule,
    // Global crypto — must come before any module that uses CryptoService.
    CryptoModule,
    // Global auth guards (AppAuthGuard, DevAuthGuard, Auth0Guard).
    // Must come before all feature modules so guards are resolvable everywhere.
    InfraAuthModule,
    AppointmentsModule,
    PatientsModule,
    ConsultationsModule,
    EhrModule,
    PrescriptionsModule,
    PackagesModule,
    BookingModule,
    FinancesModule,
    DoctorSettingsModule,
    PatientPortalModule,
    AdminModule,
    PaymentsModule,
    BillingModule,
    LeadsModule,
    SuggestionsModule,
    PromotionsModule,
    ConsultationBlocksModule,
    CapabilitiesModule,
    OfficesModule,
    DoctorTemplatesModule,
    RemindersModule,
    StorageModule,
    MessagesModule,
    QuickItemsModule,
    AuthModule,
    EmailModule,
    DoctorRegistrationModule,
    PatientIdentitiesModule,
    IntegrationsModule,
    AvailabilityBlocksModule,
    TelemetryModule,
    SpecialtiesModule,
    CredentialVerificationModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
