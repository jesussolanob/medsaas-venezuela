import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { LegalDocumentModel } from './infrastructure/persistence/models/legal-document.model';
import { SequelizeLegalDocumentRepository } from './infrastructure/persistence/repositories/sequelize-legal-document.repository';
import { LEGAL_DOCUMENT_REPOSITORY } from './domain/repositories/legal-document.repository';
import { GetCurrentTermsUseCase } from './application/use-cases/get-current-terms.use-case';
import { GetCurrentPrivacyUseCase } from './application/use-cases/get-current-privacy.use-case';
import { LegalController } from './presentation/controllers/legal.controller';

/**
 * LegalModule — serves legal documents (T&C, Privacy Policy) from the database.
 *
 * Public surface (no auth required):
 *   GET /api/legal/terms — returns the current Terms & Conditions HTML document.
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Never re-declare the Sequelize provider here.
 */
@Module({
  imports: [SequelizeModule.forFeature([LegalDocumentModel])],
  controllers: [LegalController],
  providers: [
    {
      provide: LEGAL_DOCUMENT_REPOSITORY,
      useClass: SequelizeLegalDocumentRepository,
    },
    GetCurrentTermsUseCase,
    GetCurrentPrivacyUseCase,
  ],
  // Export LEGAL_DOCUMENT_REPOSITORY so other modules (e.g. DoctorRegistrationModule)
  // can inject it without duplicating the Sequelize model registration.
  exports: [LEGAL_DOCUMENT_REPOSITORY],
})
export class LegalModule {}
