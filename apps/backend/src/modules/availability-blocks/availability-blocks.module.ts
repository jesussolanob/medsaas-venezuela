import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Model
import { AvailabilityBlockModel } from './infrastructure/database/models/availability-block.model';

// Repository binding
import { AVAILABILITY_BLOCK_REPOSITORY } from './domain/repositories/availability-block.repository';
import { SequelizeAvailabilityBlockRepository } from './infrastructure/database/repositories/sequelize-availability-block.repository';

// Use cases
import { ListAvailabilityBlocksUseCase } from './application/use-cases/availability-blocks/list-availability-blocks.use-case';
import { CreateAvailabilityBlockUseCase } from './application/use-cases/availability-blocks/create-availability-block.use-case';
import { DeleteAvailabilityBlockUseCase } from './application/use-cases/availability-blocks/delete-availability-block.use-case';

// Controller
import { AvailabilityBlocksController } from './presentation/controllers/availability-blocks.controller';

/**
 * AvailabilityBlocksModule
 *
 * Owns calendar-level availability blocking (vacations, absences) for doctors.
 * Completely separate from consultation-blocks (which are clinical note sections).
 *
 * Exports IAvailabilityBlockRepository so BookingModule can inject it for
 * slot filtering in GetAvailableSlotsUseCase.
 *
 * NOTE: Sequelize providers are NOT injected directly into the providers array —
 * they're registered via SequelizeModule.forFeature and injected via @InjectModel.
 * This avoids the "Sequelize in providers causes crash in dist" footgun.
 */
@Module({
  imports: [SequelizeModule.forFeature([AvailabilityBlockModel])],
  controllers: [AvailabilityBlocksController],
  providers: [
    {
      provide: AVAILABILITY_BLOCK_REPOSITORY,
      useClass: SequelizeAvailabilityBlockRepository,
    },
    ListAvailabilityBlocksUseCase,
    CreateAvailabilityBlockUseCase,
    DeleteAvailabilityBlockUseCase,
  ],
  exports: [AVAILABILITY_BLOCK_REPOSITORY],
})
export class AvailabilityBlocksModule {}
