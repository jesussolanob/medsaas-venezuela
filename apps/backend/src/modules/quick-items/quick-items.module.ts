import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { QuickItemModel } from './infrastructure/database/models/quick-item.model';
import { SequelizeQuickItemRepository } from './infrastructure/database/repositories/sequelize-quick-item.repository';
import { QUICK_ITEM_REPOSITORY } from './domain/repositories/quick-item.repository';

import { ListQuickItemsUseCase } from './application/use-cases/quick-items/list-quick-items.use-case';
import { CreateQuickItemUseCase } from './application/use-cases/quick-items/create-quick-item.use-case';
import { DeleteQuickItemUseCase } from './application/use-cases/quick-items/delete-quick-item.use-case';

import { QuickItemsController } from './presentation/controllers/quick-items.controller';

/**
 * QuickItemsModule — Doctor shortcut items (quick exams and medications).
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature model (QuickItemModel) here — never re-declare
 * the Sequelize provider in this module's providers array.
 */
@Module({
  imports: [SequelizeModule.forFeature([QuickItemModel])],
  controllers: [QuickItemsController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: QUICK_ITEM_REPOSITORY,
      useClass: SequelizeQuickItemRepository,
    },

    // Use cases
    ListQuickItemsUseCase,
    CreateQuickItemUseCase,
    DeleteQuickItemUseCase,
  ],
})
export class QuickItemsModule {}
