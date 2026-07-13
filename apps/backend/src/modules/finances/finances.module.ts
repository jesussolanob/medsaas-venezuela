import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { FinancialTransactionModel } from './infrastructure/database/models/financial-transaction.model';
import { AppSettingModel } from './infrastructure/database/models/app-setting.model';
import { PaymentModel } from './infrastructure/database/models/payment.model';
import { PaymentItemModel } from './infrastructure/database/models/payment-item.model';
import { IncomeConceptModel } from './infrastructure/database/models/income-concept.model';
import { BcvRateHistoryModel } from './infrastructure/database/models/bcv-rate-history.model';
import { SequelizeFinanceRepository } from './infrastructure/database/repositories/sequelize-finance.repository';
import { RedisUsdtRateStore } from './infrastructure/database/repositories/redis-usdt-rate.store';
import { SequelizePaymentRepository } from './infrastructure/database/repositories/sequelize-payment.repository';
import { SequelizeIncomeConceptRepository } from './infrastructure/database/repositories/sequelize-income-concept.repository';
import { SequelizeBcvRateHistoryRepository } from './infrastructure/database/repositories/sequelize-bcv-rate-history.repository';
import { BinanceRateFetcher } from './infrastructure/rate-fetchers/binance-rate.fetcher';
import { BcvRateFetcher } from './infrastructure/rate-fetchers/bcv-rate.fetcher';
import { BcvRateHistoryFetcher } from './infrastructure/rate-fetchers/bcv-rate-history.fetcher';
import { FINANCE_REPOSITORY } from './domain/repositories/finance.repository';
import { USDT_RATE_STORE } from './domain/repositories/usdt-rate.store';
import { PAYMENT_REPOSITORY } from './domain/repositories/payment.repository';
import { INCOME_CONCEPT_REPOSITORY } from './domain/repositories/income-concept.repository';
import { BINANCE_RATE_FETCHER, BCV_RATE_FETCHER } from './domain/repositories/rate-fetcher.ports';
import { BCV_RATE_HISTORY_REPOSITORY } from './domain/repositories/bcv-rate-history.repository';
import { BCV_RATE_HISTORY_FETCHER } from './domain/repositories/bcv-rate-history-fetcher.port';

// Use cases — finances
import { GetFinancialSummaryUseCase } from './application/use-cases/finances/get-financial-summary.use-case';
import { RecordIncomeUseCase } from './application/use-cases/finances/record-income.use-case';
import { RecordExpenseUseCase } from './application/use-cases/finances/record-expense.use-case';
import { ListTransactionsUseCase } from './application/use-cases/finances/list-transactions.use-case';
import { GetUsdtRateUseCase } from './application/use-cases/finances/get-usdt-rate.use-case';
import { UpdateUsdtRateUseCase } from './application/use-cases/finances/update-usdt-rate.use-case';
import { SetRateSourceUseCase } from './application/use-cases/finances/set-rate-source.use-case';
import { GetRatesSummaryUseCase } from './application/use-cases/finances/get-rates-summary.use-case';
import { DeleteTransactionUseCase } from './application/use-cases/finances/delete-transaction.use-case';
import { GetLifetimeIncomeUseCase } from './application/use-cases/finances/get-lifetime-income.use-case';
import { GetBcvRateByDateUseCase } from './application/use-cases/finances/get-bcv-rate-by-date.use-case';
import { ListIncomeConceptsUseCase } from './application/use-cases/finances/list-income-concepts.use-case';
import { CreateIncomeConceptUseCase } from './application/use-cases/finances/create-income-concept.use-case';
import { UpdateIncomeConceptUseCase } from './application/use-cases/finances/update-income-concept.use-case';
import { DeleteIncomeConceptUseCase } from './application/use-cases/finances/delete-income-concept.use-case';
import { UpdateTransactionUseCase } from './application/use-cases/finances/update-transaction.use-case';
import { ListIncomeTransactionsUseCase } from './application/use-cases/finances/list-income-transactions.use-case';
import { ListIncomeUseCase } from './application/use-cases/finances/list-income.use-case';

// Use cases — payments
import { ListPaymentsUseCase } from './application/use-cases/payments/list-payments.use-case';
import { GetPaymentTotalsUseCase } from './application/use-cases/payments/get-payment-totals.use-case';
import { UpdatePaymentStatusUseCase } from './application/use-cases/payments/update-payment-status.use-case';
import { AddPaymentItemUseCase } from './application/use-cases/payments/add-payment-item.use-case';
import { RemovePaymentItemUseCase } from './application/use-cases/payments/remove-payment-item.use-case';
import { ListPaymentItemsUseCase } from './application/use-cases/payments/list-payment-items.use-case';
import { AttachPaymentReceiptUseCase } from './application/use-cases/payments/attach-payment-receipt.use-case';
import { UpdatePaymentDetailsUseCase } from './application/use-cases/payments/update-payment-details.use-case';

// Controllers
import { FinancesController } from './presentation/controllers/finances.controller';
import { PaymentsController } from './presentation/controllers/payments.controller';
import {
  SettingsController,
  AdminSettingsController,
} from './presentation/controllers/settings.controller';

// Guards (RolesGuard is stateless/injectable — provided here for DI in this module)
import { RolesGuard } from '../../presentation/guards/roles.guard';

// AppointmentModel registered here so SequelizePaymentRepository can perform
// joins on appointments via raw SQL (model registration ensures sequelize-typescript
// initialises the table mapping for this module's connection scope).
import { AppointmentModel } from '../appointments/infrastructure/database/models/appointment.model';

// ConsultationsModule exports CONSULTATION_REPOSITORY (for RecordIncomeUseCase).
// PatientsModule exports PATIENT_REPOSITORY (for RecordIncomeUseCase + UpdateTransactionUseCase).
import { ConsultationsModule } from '../consultations/consultations.module';
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      FinancialTransactionModel,
      AppSettingModel,
      PaymentModel,
      PaymentItemModel,
      AppointmentModel,
      IncomeConceptModel,
      BcvRateHistoryModel,
    ]),
    ConsultationsModule,
    PatientsModule,
  ],
  controllers: [
    FinancesController,
    PaymentsController,
    SettingsController,
    AdminSettingsController,
  ],
  providers: [
    // Sequelize is global — no re-import needed.
    // Redis (REDIS_CLIENT) is global via RedisModule.

    // Rate fetchers: domain interfaces → infrastructure implementations
    {
      provide: BINANCE_RATE_FETCHER,
      useClass: BinanceRateFetcher,
    },
    {
      provide: BCV_RATE_FETCHER,
      useClass: BcvRateFetcher,
    },

    // Repository bindings: domain interfaces → implementations
    {
      provide: FINANCE_REPOSITORY,
      useClass: SequelizeFinanceRepository,
    },
    {
      provide: USDT_RATE_STORE,
      useClass: RedisUsdtRateStore,
    },
    {
      provide: PAYMENT_REPOSITORY,
      useClass: SequelizePaymentRepository,
    },
    {
      provide: INCOME_CONCEPT_REPOSITORY,
      useClass: SequelizeIncomeConceptRepository,
    },
    {
      provide: BCV_RATE_HISTORY_REPOSITORY,
      useClass: SequelizeBcvRateHistoryRepository,
    },

    // Historical BCV rate fetcher: domain port → infrastructure implementation.
    {
      provide: BCV_RATE_HISTORY_FETCHER,
      useClass: BcvRateHistoryFetcher,
    },

    // Guards
    RolesGuard,

    // Use cases — finances
    GetFinancialSummaryUseCase,
    RecordIncomeUseCase,
    RecordExpenseUseCase,
    ListTransactionsUseCase,
    GetUsdtRateUseCase,
    UpdateUsdtRateUseCase,
    SetRateSourceUseCase,
    GetRatesSummaryUseCase,
    DeleteTransactionUseCase,
    GetLifetimeIncomeUseCase,
    GetBcvRateByDateUseCase,
    ListIncomeConceptsUseCase,
    CreateIncomeConceptUseCase,
    UpdateIncomeConceptUseCase,
    DeleteIncomeConceptUseCase,
    UpdateTransactionUseCase,
    ListIncomeTransactionsUseCase,
    ListIncomeUseCase,

    // Use cases — payments
    ListPaymentsUseCase,
    GetPaymentTotalsUseCase,
    UpdatePaymentStatusUseCase,
    AddPaymentItemUseCase,
    RemovePaymentItemUseCase,
    ListPaymentItemsUseCase,
    AttachPaymentReceiptUseCase,
    UpdatePaymentDetailsUseCase,
  ],
  // Export PAYMENT_REPOSITORY so BookingModule can inject it for CreateBookingUseCase.
  // Export USDT_RATE_STORE so DoctorSettingsModule can resolve the effective exchange rate.
  exports: [PAYMENT_REPOSITORY, USDT_RATE_STORE],
})
export class FinancesModule {}
