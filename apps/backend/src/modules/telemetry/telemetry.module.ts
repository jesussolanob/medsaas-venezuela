import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { TelemetrySessionModel } from './infrastructure/database/models/telemetry-session.model';
import { SequelizeTelemetrySessionRepository } from './infrastructure/database/repositories/sequelize-telemetry-session.repository';
import { TELEMETRY_SESSION_REPOSITORY } from './domain/repositories/telemetry-session.repository';

import { UpsertTelemetrySessionUseCase } from './application/use-cases/telemetry/upsert-telemetry-session.use-case';
import { QueryTelemetrySessionsUseCase } from './application/use-cases/telemetry/query-telemetry-sessions.use-case';

import { TelemetryController } from './presentation/controllers/telemetry.controller';

@Module({
  imports: [SequelizeModule.forFeature([TelemetrySessionModel])],
  controllers: [TelemetryController],
  providers: [
    {
      provide: TELEMETRY_SESSION_REPOSITORY,
      useClass: SequelizeTelemetrySessionRepository,
    },
    UpsertTelemetrySessionUseCase,
    QueryTelemetrySessionsUseCase,
  ],
})
export class TelemetryModule {}
