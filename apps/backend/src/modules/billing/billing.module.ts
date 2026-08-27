import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// External modules
import { EmailModule } from '../email/email.module';
import { StorageModule } from '../storage/storage.module';

// Models (own)
import { SubscriptionPaymentModel } from './infrastructure/database/models/subscription-payment.model';
import { InvoiceModel } from './infrastructure/database/models/invoice.model';
import { BillingDocumentModel } from './infrastructure/database/models/billing-document.model';
import { SubscriptionChangeLogModel } from './infrastructure/database/models/subscription-change-log.model';

// Models (imported from admin module — avoids redefining shared table mappings)
import { ProfileAdminModel } from '../admin/infrastructure/database/models/profile.model';
import { AdminSubscriptionModel } from '../admin/infrastructure/database/models/subscription.model';
import { PlanConfigModel } from '../admin/infrastructure/database/models/plan-config.model';
import { PlanPriceModel } from '../admin/infrastructure/database/models/plan-price.model';

// Models (imported from finances module — app_settings for BCV rate)
import { AppSettingModel } from '../finances/infrastructure/database/models/app-setting.model';

// Repositories (bindings)
import { SUBSCRIPTION_PAYMENT_REPOSITORY } from './domain/repositories/subscription-payment.repository';
import { INVOICE_REPOSITORY } from './domain/repositories/invoice.repository';
import { BILLING_DOCUMENT_REPOSITORY } from './domain/repositories/billing-document.repository';
import { PROFILE_LOOKUP_REPOSITORY } from './domain/repositories/profile-lookup.repository';
import { PLATFORM_RATE_PROVIDER } from './domain/repositories/platform-rate.provider';
import { PLAN_PRICE_PROVIDER } from './domain/repositories/plan-price.provider';
import { SequelizeSubscriptionPaymentRepository } from './infrastructure/database/repositories/sequelize-subscription-payment.repository';
import { SequelizeInvoiceRepository } from './infrastructure/database/repositories/sequelize-invoice.repository';
import { SequelizeBillingDocumentRepository } from './infrastructure/database/repositories/sequelize-billing-document.repository';
import { SequelizeProfileLookupRepository } from './infrastructure/database/repositories/sequelize-profile-lookup.repository';
import { BillingRateProvider } from './infrastructure/rate/billing-rate.provider';
import { SequelizePlanPriceProvider } from './infrastructure/database/repositories/sequelize-plan-price.provider';

// Use cases
import { ListSubscriptionPaymentsUseCase } from './application/use-cases/billing/list-subscription-payments.use-case';
import { ApproveSubscriptionPaymentUseCase } from './application/use-cases/billing/approve-subscription-payment.use-case';
import { RejectSubscriptionPaymentUseCase } from './application/use-cases/billing/reject-subscription-payment.use-case';
import { RegisterManualPaymentUseCase } from './application/use-cases/billing/register-manual-payment.use-case';
import { CreateInvoiceUseCase } from './application/use-cases/billing/create-invoice.use-case';
import { ListInvoicesUseCase } from './application/use-cases/billing/list-invoices.use-case';
import { MarkInvoicePaidUseCase } from './application/use-cases/billing/mark-invoice-paid.use-case';
import { SendInvoiceEmailUseCase } from './application/use-cases/billing/send-invoice-email.use-case';
import { ListBillingDocumentsUseCase } from './application/use-cases/billing/list-billing-documents.use-case';
import { CreateBillingDocumentUseCase } from './application/use-cases/billing/create-billing-document.use-case';
import { GetFinanceStatsUseCase } from './application/use-cases/billing/get-finance-stats.use-case';
import { GetCheckoutInfoUseCase } from './application/use-cases/billing/get-checkout-info.use-case';
import { SubmitDoctorPaymentUseCase } from './application/use-cases/billing/submit-doctor-payment.use-case';
import { ListDoctorPaymentsUseCase } from './application/use-cases/billing/list-doctor-payments.use-case';
import { GetPaymentReceiptUrlUseCase } from './application/use-cases/billing/get-payment-receipt-url.use-case';

// Guards
import { RolesGuard } from '../../presentation/guards/roles.guard';

// Controllers
import { SubscriptionPaymentsController } from './presentation/controllers/subscription-payments.controller';
import { InvoicesController } from './presentation/controllers/invoices.controller';
import { BillingDocumentsController } from './presentation/controllers/billing-documents.controller';
import { DoctorSubscriptionPaymentsController } from './presentation/controllers/doctor-subscription-payments.controller';

/**
 * BillingModule — manages platform subscription payments, admin invoices,
 * and doctor-level billing documents.
 *
 * IMPORTANT: Sequelize global instance is NOT added to providers — it is
 * injected globally by SequelizeModule.forRootAsync in AppModule.
 * Adding it again here causes a crash in the dist build.
 *
 * Cross-module model re-registration pattern:
 *   - ProfileAdminModel, AdminSubscriptionModel → approve flow (subscriptions + profiles tables)
 *   - PlanConfigModel, PlanPriceModel → checkout price lookup
 *   - AppSettingModel → BCV rate lookup (usdt_rate key written by finances module)
 * Re-registering the same model class in multiple modules is the correct NestJS
 * pattern for cross-module table access — no new model classes are created.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      SubscriptionPaymentModel,
      InvoiceModel,
      BillingDocumentModel,
      SubscriptionChangeLogModel,
      ProfileAdminModel,
      AdminSubscriptionModel,
      PlanConfigModel,
      PlanPriceModel,
      AppSettingModel,
    ]),
    // Provides EMAIL_PORT token and MailerService for SendInvoiceEmailUseCase
    EmailModule,
    // Provides STORAGE_PORT for GetPaymentReceiptUrlUseCase (signed URL generation)
    StorageModule,
  ],
  controllers: [
    SubscriptionPaymentsController,
    InvoicesController,
    BillingDocumentsController,
    DoctorSubscriptionPaymentsController,
  ],
  providers: [
    // Repository bindings: domain interfaces → Sequelize implementations
    {
      provide: SUBSCRIPTION_PAYMENT_REPOSITORY,
      useClass: SequelizeSubscriptionPaymentRepository,
    },
    {
      provide: INVOICE_REPOSITORY,
      useClass: SequelizeInvoiceRepository,
    },
    {
      provide: BILLING_DOCUMENT_REPOSITORY,
      useClass: SequelizeBillingDocumentRepository,
    },
    {
      provide: PROFILE_LOOKUP_REPOSITORY,
      useClass: SequelizeProfileLookupRepository,
    },
    // Port bindings: domain provider interfaces → infrastructure implementations
    {
      provide: PLATFORM_RATE_PROVIDER,
      useClass: BillingRateProvider,
    },
    {
      provide: PLAN_PRICE_PROVIDER,
      useClass: SequelizePlanPriceProvider,
    },

    // Guards (stateless, required by DI in this module scope)
    RolesGuard,

    // Use cases — subscription payments (admin)
    ListSubscriptionPaymentsUseCase,
    ApproveSubscriptionPaymentUseCase,
    RejectSubscriptionPaymentUseCase,
    RegisterManualPaymentUseCase,

    // Use cases — doctor self-service payments (WP-B)
    GetCheckoutInfoUseCase,
    SubmitDoctorPaymentUseCase,
    ListDoctorPaymentsUseCase,
    GetPaymentReceiptUrlUseCase,

    // Use cases — invoices
    CreateInvoiceUseCase,
    ListInvoicesUseCase,
    MarkInvoicePaidUseCase,
    SendInvoiceEmailUseCase,

    // Use cases — billing documents
    ListBillingDocumentsUseCase,
    CreateBillingDocumentUseCase,

    // Use cases — finance stats (admin aggregate)
    GetFinanceStatsUseCase,
  ],
})
export class BillingModule {}
