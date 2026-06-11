import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { ActionEventModel } from './infrastructure/database/models/action-event.model';
import { SequelizeActionEventRepository } from './infrastructure/database/repositories/sequelize-action-event.repository';
import { ACTION_EVENT_REPOSITORY } from './domain/repositories/action-event.repository';

import { IngestEventsBatchUseCase } from './application/use-cases/telemetry/ingest-events-batch.use-case';
import { QueryDoctorEventsUseCase } from './application/use-cases/telemetry/query-doctor-events.use-case';

import { TelemetryController } from './presentation/controllers/telemetry.controller';

@Module({
  imports: [SequelizeModule.forFeature([ActionEventModel])],
  controllers: [TelemetryController],
  providers: [
    {
      provide: ACTION_EVENT_REPOSITORY,
      useClass: SequelizeActionEventRepository,
    },
    IngestEventsBatchUseCase,
    QueryDoctorEventsUseCase,
  ],
})
export class TelemetryModule {}
