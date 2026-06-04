import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Models (new)
import { SubscriptionPaymentModel } from './infrastructure/database/models/subscription-payment.model';
import { InvoiceModel } from './infrastructure/database/models/invoice.model';
import { BillingDocumentModel } from './infrastructure/database/models/billing-document.model';
import { SubscriptionChangeLogModel } from './infrastructure/database/models/subscription-change-log.model';

// Models (imported from admin module — avoids redefining shared table mappings)
import { ProfileAdminModel } from '../admin/infrastructure/database/models/profile.model';
import { AdminSubscriptionModel } from '../admin/infrastructure/database/models/subscription.model';

// Repositories (bindings)
import { SUBSCRIPTION_PAYMENT_REPOSITORY } from './domain/repositories/subscription-payment.repository';
import { INVOICE_REPOSITORY } from './domain/repositories/invoice.repository';
import { BILLING_DOCUMENT_REPOSITORY } from './domain/repositories/billing-document.repository';
import { SequelizeSubscriptionPaymentRepository } from './infrastructure/database/repositories/sequelize-subscription-payment.repository';
import { SequelizeInvoiceRepository } from './infrastructure/database/repositories/sequelize-invoice.repository';
import { SequelizeBillingDocumentRepository } from './infrastructure/database/repositories/sequelize-billing-document.repository';

// Use cases
import { ListSubscriptionPaymentsUseCase } from './application/use-cases/billing/list-subscription-payments.use-case';
import { ApproveSubscriptionPaymentUseCase } from './application/use-cases/billing/approve-subscription-payment.use-case';
import { RejectSubscriptionPaymentUseCase } from './application/use-cases/billing/reject-subscription-payment.use-case';
import { CreateInvoiceUseCase } from './application/use-cases/billing/create-invoice.use-case';
import { ListInvoicesUseCase } from './application/use-cases/billing/list-invoices.use-case';
import { MarkInvoicePaidUseCase } from './application/use-cases/billing/mark-invoice-paid.use-case';
import { ListBillingDocumentsUseCase } from './application/use-cases/billing/list-billing-documents.use-case';
import { CreateBillingDocumentUseCase } from './application/use-cases/billing/create-billing-document.use-case';

// Guards
import { RolesGuard } from '../../presentation/guards/roles.guard';

// Controllers
import { SubscriptionPaymentsController } from './presentation/controllers/subscription-payments.controller';
import { InvoicesController } from './presentation/controllers/invoices.controller';
import { BillingDocumentsController } from './presentation/controllers/billing-documents.controller';

/**
 * BillingModule — manages platform subscription payments, admin invoices,
 * and doctor-level billing documents.
 *
 * IMPORTANT: Sequelize global instance is NOT added to providers — it is
 * injected globally by SequelizeModule.forRootAsync in AppModule.
 * Adding it again here causes a crash in the dist build.
 *
 * ProfileAdminModel and AdminSubscriptionModel are registered via forFeature
 * so the approve flow can update the subscriptions and profiles tables.
 * They are NOT redefined — the same class objects from the admin module are
 * re-registered here, which is the correct pattern for multi-module access to
 * shared tables.
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
    ]),
  ],
  controllers: [SubscriptionPaymentsController, InvoicesController, BillingDocumentsController],
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

    // Guards (stateless, required by DI in this module scope)
    RolesGuard,

    // Use cases — subscription payments
    ListSubscriptionPaymentsUseCase,
    ApproveSubscriptionPaymentUseCase,
    RejectSubscriptionPaymentUseCase,

    // Use cases — invoices
    CreateInvoiceUseCase,
    ListInvoicesUseCase,
    MarkInvoicePaidUseCase,

    // Use cases — billing documents
    ListBillingDocumentsUseCase,
    CreateBillingDocumentUseCase,
  ],
})
export class BillingModule {}
