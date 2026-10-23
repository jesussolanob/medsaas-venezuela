import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Infrastructure
import { StandaloneDocumentModel } from './infrastructure/persistence/models/standalone-document.model';
import { STANDALONE_DOCUMENT_REPOSITORY } from './domain/repositories/istandalone-document.repository';
import { SequelizeStandaloneDocumentRepository } from './infrastructure/persistence/repositories/sequelize-standalone-document.repository';

// Use cases
import { ListStandaloneDocumentsUseCase } from './application/use-cases/list-standalone-documents.use-case';
import { GetStandaloneDocumentUseCase } from './application/use-cases/get-standalone-document.use-case';
import { CreateStandaloneDocumentUseCase } from './application/use-cases/create-standalone-document.use-case';
import { UpdateStandaloneDocumentUseCase } from './application/use-cases/update-standalone-document.use-case';
import { DeleteStandaloneDocumentUseCase } from './application/use-cases/delete-standalone-document.use-case';
import { IssueStandaloneDocumentUseCase } from './application/use-cases/issue-standalone-document.use-case';
import { VoidStandaloneDocumentUseCase } from './application/use-cases/void-standalone-document.use-case';

// Controller
import { StandaloneDocumentsController } from './presentation/controllers/standalone-documents.controller';

// External dependencies
import { PatientsModule } from '../patients/patients.module';

/**
 * StandaloneDocumentsModule — recipe/paraclinical/reposo documents without
 * a consultation.
 *
 * Plan gating: delta_base + delta_plus + free_trial → enabled
 * (seeded in migration 20261022000001 Part 4b).
 *
 * Depends on:
 *   - PatientsModule → PATIENT_REPOSITORY (anti-IDOR ownership check on create)
 *
 * IMPORTANT: Sequelize is NOT in providers[] — already registered globally
 * by SequelizeModule.forRootAsync in AppModule. Adding it here causes a boot crash.
 */
@Module({
  imports: [SequelizeModule.forFeature([StandaloneDocumentModel]), PatientsModule],
  controllers: [StandaloneDocumentsController],
  providers: [
    {
      provide: STANDALONE_DOCUMENT_REPOSITORY,
      useClass: SequelizeStandaloneDocumentRepository,
    },
    ListStandaloneDocumentsUseCase,
    GetStandaloneDocumentUseCase,
    CreateStandaloneDocumentUseCase,
    UpdateStandaloneDocumentUseCase,
    DeleteStandaloneDocumentUseCase,
    IssueStandaloneDocumentUseCase,
    VoidStandaloneDocumentUseCase,
  ],
})
export class StandaloneDocumentsModule {}
