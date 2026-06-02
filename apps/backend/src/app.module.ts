import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { databaseConfig } from './infrastructure/config/database.config';
import { RedisModule } from './infrastructure/cache/redis.module';
import { HealthController } from './presentation/controllers/health.controller';
import { GlobalExceptionFilter } from './presentation/filters/global-exception.filter';
import { LoggingInterceptor } from './presentation/interceptors/logging.interceptor';
import { AppointmentsModule } from './modules/appointments/appointments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/backend/.env', '.env'],
    }),
    SequelizeModule.forRootAsync({ useFactory: databaseConfig }),
    RedisModule,
    AppointmentsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
