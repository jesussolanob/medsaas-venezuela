import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { FinancialTransactionModel } from './infrastructure/database/models/financial-transaction.model';
import { AppSettingModel } from './infrastructure/database/models/app-setting.model';
import { SequelizeFinanceRepository } from './infrastructure/database/repositories/sequelize-finance.repository';
import { RedisUsdtRateStore } from './infrastructure/database/repositories/redis-usdt-rate.store';
import { FINANCE_REPOSITORY } from './domain/repositories/finance.repository';
import { USDT_RATE_STORE } from './domain/repositories/usdt-rate.store';

// Use cases
import { GetFinancialSummaryUseCase } from './application/use-cases/finances/get-financial-summary.use-case';
import { RecordIncomeUseCase } from './application/use-cases/finances/record-income.use-case';
import { RecordExpenseUseCase } from './application/use-cases/finances/record-expense.use-case';
import { ListTransactionsUseCase } from './application/use-cases/finances/list-transactions.use-case';
import { GetUsdtRateUseCase } from './application/use-cases/finances/get-usdt-rate.use-case';
import { UpdateUsdtRateUseCase } from './application/use-cases/finances/update-usdt-rate.use-case';

// Controllers
import { FinancesController } from './presentation/controllers/finances.controller';
import {
  SettingsController,
  AdminSettingsController,
} from './presentation/controllers/settings.controller';

// Guards (RolesGuard is stateless/injectable — provided here for DI in this module)
import { RolesGuard } from '../../presentation/guards/roles.guard';

@Module({
  imports: [SequelizeModule.forFeature([FinancialTransactionModel, AppSettingModel])],
  controllers: [FinancesController, SettingsController, AdminSettingsController],
  providers: [
    // Sequelize is global — no re-import needed.
    // Redis (REDIS_CLIENT) is global via RedisModule.

    // Repository bindings: domain interfaces → implementations
    {
      provide: FINANCE_REPOSITORY,
      useClass: SequelizeFinanceRepository,
    },
    {
      provide: USDT_RATE_STORE,
      useClass: RedisUsdtRateStore,
    },

    // Guards
    RolesGuard,

    // Use cases
    GetFinancialSummaryUseCase,
    RecordIncomeUseCase,
    RecordExpenseUseCase,
    ListTransactionsUseCase,
    GetUsdtRateUseCase,
    UpdateUsdtRateUseCase,
  ],
})
export class FinancesModule {}
