import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/backend/.env', '.env'],
    }),
    SequelizeModule.forRootAsync({ useFactory: databaseConfig }),
    RedisModule,
    // Global crypto — must come before any module that uses CryptoService.
    CryptoModule,
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
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
