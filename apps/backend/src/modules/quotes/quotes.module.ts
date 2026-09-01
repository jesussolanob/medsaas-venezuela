import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Infrastructure models
import { QuoteModel } from './infrastructure/persistence/models/quote.model';
import { QuoteItemModel } from './infrastructure/persistence/models/quote-item.model';
import { QuoteShareLinkModel } from './infrastructure/persistence/models/quote-share-link.model';

// Repository binding
import { QUOTE_REPOSITORY } from './domain/repositories/iquote.repository';
import { SequelizeQuoteRepository } from './infrastructure/persistence/repositories/sequelize-quote.repository';

// Use cases
import { CreateQuoteUseCase } from './application/use-cases/create-quote.use-case';
import { GetQuoteUseCase } from './application/use-cases/get-quote.use-case';
import { ListQuotesUseCase } from './application/use-cases/list-quotes.use-case';
import { UpdateQuoteUseCase } from './application/use-cases/update-quote.use-case';
import { DeleteQuoteUseCase } from './application/use-cases/delete-quote.use-case';
import { SendQuoteUseCase } from './application/use-cases/send-quote.use-case';
import { UpdateQuoteStatusUseCase } from './application/use-cases/update-quote-status.use-case';
import { GetPublicQuoteUseCase } from './application/use-cases/get-public-quote.use-case';

// Controllers
import { QuotesController } from './presentation/controllers/quotes.controller';
import { PublicQuotesController } from './presentation/controllers/public-quotes.controller';

// External modules
import { EmailModule } from '../email/email.module';
import { FinancesModule } from '../finances/finances.module';
import { DoctorSettingsModule } from '../doctor-settings/doctor-settings.module';
import { DoctorTemplatesModule } from '../doctor-templates/doctor-templates.module';
import { StorageModule } from '../storage/storage.module';
import { PatientsModule } from '../patients/patients.module';

/**
 * QuotesModule — presupuestos/cotizaciones for specialists.
 *
 * Plan gating: delta_plus + free_trial → enabled (seeded in migration Part 6).
 * Without plan_features rows, planUnlocks() returns false and the module is
 * invisible in /admin/plan-features.
 *
 * Depends on:
 *   - EmailModule        → MailerService (quote_sent template)
 *   - FinancesModule     → USDT_RATE_STORE (freeze BCV rate at send time)
 *   - DoctorSettingsModule  → DOCTOR_PROFILE_REPOSITORY (branding for public view + doctor name in email)
 *   - DoctorTemplatesModule → DOCTOR_TEMPLATE_REPOSITORY (template config for PDF)
 *   - StorageModule      → STORAGE_PORT (re-sign GCS URLs for logo / signature)
 *   - PatientsModule     → PATIENT_REPOSITORY (patient name → IDs for encrypted name filter)
 *
 * IMPORTANT: Sequelize is NOT in providers[] — already registered globally by
 * SequelizeModule.forRootAsync in AppModule. Adding it here causes a boot crash.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([QuoteModel, QuoteItemModel, QuoteShareLinkModel]),
    EmailModule,
    FinancesModule,
    DoctorSettingsModule,
    DoctorTemplatesModule,
    StorageModule,
    PatientsModule,
  ],
  controllers: [QuotesController, PublicQuotesController],
  providers: [
    {
      provide: QUOTE_REPOSITORY,
      useClass: SequelizeQuoteRepository,
    },
    CreateQuoteUseCase,
    GetQuoteUseCase,
    ListQuotesUseCase,
    UpdateQuoteUseCase,
    DeleteQuoteUseCase,
    SendQuoteUseCase,
    UpdateQuoteStatusUseCase,
    GetPublicQuoteUseCase,
  ],
})
export class QuotesModule {}
