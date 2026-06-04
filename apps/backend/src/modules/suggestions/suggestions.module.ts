import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { DoctorSuggestionModel } from './infrastructure/persistence/models/doctor-suggestion.model';
import { SequelizeSuggestionRepository } from './infrastructure/persistence/repositories/sequelize-suggestion.repository';
import { SUGGESTION_REPOSITORY } from './domain/repositories/suggestion.repository';

import { ListMySuggestionsUseCase } from './application/use-cases/suggestions/list-my-suggestions.use-case';
import { CreateSuggestionUseCase } from './application/use-cases/suggestions/create-suggestion.use-case';
import { ListAllSuggestionsUseCase } from './application/use-cases/suggestions/list-all-suggestions.use-case';
import { RespondSuggestionUseCase } from './application/use-cases/suggestions/respond-suggestion.use-case';

import { RolesGuard } from '../../presentation/guards/roles.guard';

import { SuggestionsController } from './presentation/controllers/suggestions.controller';
import { AdminSuggestionsController } from './presentation/controllers/admin-suggestions.controller';

/**
 * SuggestionsModule — doctor suggestion inbox reviewed by admins.
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature model (DoctorSuggestionModel) here —
 * never re-declare the Sequelize provider in this module's providers array.
 */
@Module({
  imports: [SequelizeModule.forFeature([DoctorSuggestionModel])],
  controllers: [SuggestionsController, AdminSuggestionsController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: SUGGESTION_REPOSITORY,
      useClass: SequelizeSuggestionRepository,
    },

    // Guards
    RolesGuard,

    // Use cases
    ListMySuggestionsUseCase,
    CreateSuggestionUseCase,
    ListAllSuggestionsUseCase,
    RespondSuggestionUseCase,
  ],
})
export class SuggestionsModule {}
