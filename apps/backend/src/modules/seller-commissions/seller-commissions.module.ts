import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { StorageModule } from '../storage/storage.module';
import { FinancesModule } from '../finances/finances.module';

// Models
import { SellerCommissionModel } from './infrastructure/persistence/models/seller-commission.model';
import { SellerPaymentModel } from './infrastructure/persistence/models/seller-payment.model';
import { CommissionProfileModel } from './infrastructure/persistence/models/commission-profile.model';

// Repository binding
import { SELLER_COMMISSION_REPOSITORY } from './domain/repositories/seller-commission.repository';
import { SequelizeSellerCommissionRepository } from './infrastructure/persistence/repositories/sequelize-seller-commission.repository';

// Use cases
import { AccrueSignupCommissionUseCase } from './application/use-cases/accrue-signup-commission.use-case';
import { AccruePlanCommissionUseCase } from './application/use-cases/accrue-plan-commission.use-case';
import { GetSellerCommissionsUseCase } from './application/use-cases/get-seller-commissions.use-case';
import { GetPendingCommissionsBySellerUseCase } from './application/use-cases/get-pending-commissions-by-seller.use-case';
import { RegisterSellerPaymentUseCase } from './application/use-cases/register-seller-payment.use-case';
import { ApproveCommissionsUseCase } from './application/use-cases/approve-commissions.use-case';
import { GetSellerPaymentsUseCase } from './application/use-cases/get-seller-payments.use-case';
import { AssignSpecialistToSellerUseCase } from './application/use-cases/assign-specialist-to-seller.use-case';
import { GetSellerPaymentReceiptUrlUseCase } from './application/use-cases/get-seller-payment-receipt-url.use-case';
import { GetAdminSellerPaymentReceiptUrlUseCase } from './application/use-cases/get-admin-seller-payment-receipt-url.use-case';
import { GetSellerPendingSummaryUseCase } from './application/use-cases/get-seller-pending-summary.use-case';

// Guards
import { RolesGuard } from '../../presentation/guards/roles.guard';

// Controllers
import {
  SellerCommissionsAdminController,
  SellerCommissionsSellerController,
} from './presentation/controllers/seller-commissions.controller';

/**
 * SellerCommissionsModule
 *
 * Tracks seller commissions and payments for the attribution/sales program.
 *
 * Commission types:
 *   - signup  ($10 USD) — fired at onboarding completion, code attribution only.
 *   - plan    ($10/$20) — fired at first paid-plan activation, any attribution.
 *
 * Admin endpoints:
 *   GET  /api/admin/seller-commissions/pending          — pending totals by seller
 *   POST /api/admin/seller-commissions/payments         — register payment batch
 *   GET  /api/admin/seller-commissions/payments/:sid    — payment history for seller
 *   POST /api/admin/seller-commissions/assign           — assign specialist to seller
 *
 * Seller portal endpoints:
 *   GET  /api/seller/commissions   — all commissions for authenticated seller
 *   GET  /api/seller/payments      — payment history for authenticated seller
 *
 * EXPORTS:
 *   AccrueSignupCommissionUseCase      — used by DoctorSettingsModule (complete-onboarding)
 *   AccruePlanCommissionUseCase        — used by BillingModule + AdminModule (plan changes)
 *   GetSellerPendingSummaryUseCase     — used by SellersModule (deactivate-seller-account)
 *
 * IMPORTANT: Sequelize is NOT in providers[] — already registered globally by
 * SequelizeModule.forRootAsync in AppModule.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([SellerCommissionModel, SellerPaymentModel, CommissionProfileModel]),
    StorageModule,
    FinancesModule,
  ],
  controllers: [SellerCommissionsAdminController, SellerCommissionsSellerController],
  providers: [
    {
      provide: SELLER_COMMISSION_REPOSITORY,
      useClass: SequelizeSellerCommissionRepository,
    },
    RolesGuard,
    AccrueSignupCommissionUseCase,
    AccruePlanCommissionUseCase,
    GetSellerCommissionsUseCase,
    GetPendingCommissionsBySellerUseCase,
    ApproveCommissionsUseCase,
    RegisterSellerPaymentUseCase,
    GetSellerPaymentsUseCase,
    AssignSpecialistToSellerUseCase,
    GetSellerPaymentReceiptUrlUseCase,
    GetAdminSellerPaymentReceiptUrlUseCase,
    GetSellerPendingSummaryUseCase,
  ],
  exports: [
    AccrueSignupCommissionUseCase,
    AccruePlanCommissionUseCase,
    GetSellerPendingSummaryUseCase,
  ],
})
export class SellerCommissionsModule {}
