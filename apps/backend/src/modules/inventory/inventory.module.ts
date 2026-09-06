import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Infrastructure models
import { ProductModel } from './infrastructure/persistence/models/product.model';
import { InventoryMovementModel } from './infrastructure/persistence/models/inventory-movement.model';

// Repository binding
import { PRODUCT_REPOSITORY } from './domain/repositories/iproduct.repository';
import { SequelizeProductRepository } from './infrastructure/persistence/repositories/sequelize-product.repository';

// Use cases
import { ListProductsUseCase } from './application/use-cases/list-products.use-case';
import { GetProductUseCase } from './application/use-cases/get-product.use-case';
import { CreateProductUseCase } from './application/use-cases/create-product.use-case';
import { UpdateProductUseCase } from './application/use-cases/update-product.use-case';
import { DeactivateProductUseCase } from './application/use-cases/deactivate-product.use-case';
import { RegisterMovementUseCase } from './application/use-cases/register-movement.use-case';
import { ListMovementsUseCase } from './application/use-cases/list-movements.use-case';
import { ReverseMovementUseCase } from './application/use-cases/reverse-movement.use-case';
import { BulkPurchaseUseCase } from './application/use-cases/bulk-purchase.use-case';

// Controller
import { InventoryController } from './presentation/controllers/inventory.controller';

// External modules needed by use cases
import { StorageModule } from '../storage/storage.module';

/**
 * InventoryModule — product catalog + stock ledger for doctors.
 *
 * Plan gating: delta_plus + free_trial → enabled (seeded in migration Part 5).
 * Without a plan_features row the module is invisible in /admin/plan-features.
 *
 * IMPORTANT: Sequelize is NOT in providers[] — already registered globally by
 * SequelizeModule.forRootAsync in AppModule. Adding it here causes a boot crash.
 *
 * Stock sync during consultation approval is handled directly by
 * SequelizeConsultationRepository.approveWithExtras() using raw SQL within the
 * same transaction. There is no cross-module use-case call needed.
 */
@Module({
  imports: [SequelizeModule.forFeature([ProductModel, InventoryMovementModel]), StorageModule],
  controllers: [InventoryController],
  providers: [
    {
      provide: PRODUCT_REPOSITORY,
      useClass: SequelizeProductRepository,
    },
    ListProductsUseCase,
    GetProductUseCase,
    CreateProductUseCase,
    UpdateProductUseCase,
    DeactivateProductUseCase,
    RegisterMovementUseCase,
    ListMovementsUseCase,
    ReverseMovementUseCase,
    BulkPurchaseUseCase,
  ],
  exports: [PRODUCT_REPOSITORY],
})
export class InventoryModule {}
