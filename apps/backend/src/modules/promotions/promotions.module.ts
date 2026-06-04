import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { PlanPromotionModel } from './infrastructure/persistence/models/plan-promotion.model';
import { SequelizePromotionRepository } from './infrastructure/persistence/repositories/sequelize-promotion.repository';
import { PROMOTION_REPOSITORY } from './domain/repositories/promotion.repository';

import { ListAllPromotionsUseCase } from './application/use-cases/promotions/list-all-promotions.use-case';
import { ListActivePromotionsUseCase } from './application/use-cases/promotions/list-active-promotions.use-case';
import { CreatePromotionUseCase } from './application/use-cases/promotions/create-promotion.use-case';
import { UpdatePromotionUseCase } from './application/use-cases/promotions/update-promotion.use-case';
import { DeletePromotionUseCase } from './application/use-cases/promotions/delete-promotion.use-case';

import { RolesGuard } from '../../presentation/guards/roles.guard';

import { AdminPromotionsController } from './presentation/controllers/admin-promotions.controller';
import { PromotionsController } from './presentation/controllers/promotions.controller';

/**
 * PromotionsModule — plan promotion pricing management.
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature model (PlanPromotionModel) here —
 * never re-declare the Sequelize provider in this module's providers array.
 */
@Module({
  imports: [SequelizeModule.forFeature([PlanPromotionModel])],
  controllers: [AdminPromotionsController, PromotionsController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: PROMOTION_REPOSITORY,
      useClass: SequelizePromotionRepository,
    },

    // Guards
    RolesGuard,

    // Use cases
    ListAllPromotionsUseCase,
    ListActivePromotionsUseCase,
    CreatePromotionUseCase,
    UpdatePromotionUseCase,
    DeletePromotionUseCase,
  ],
})
export class PromotionsModule {}
