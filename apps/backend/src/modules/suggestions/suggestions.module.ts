import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { DoctorSuggestionModel } from './infrastructure/persistence/models/doctor-suggestion.model';
import { SequelizeSuggestionRepository } from './infrastructure/persistence/repositories/sequelize-suggestion.repository';
import { SUGGESTION_REPOSITORY } from './domain/repositories/suggestion.repository';

// Profile lookup (admin enrichment — doctor identity for admin suggestion listing)
import { ProfileAdminModel } from '../admin/infrastructure/database/models/profile.model';
import { SequelizeSuggestionProfileLookupRepository } from './infrastructure/persistence/repositories/sequelize-suggestion-profile-lookup.repository';
import { SUGGESTION_PROFILE_LOOKUP_REPOSITORY } from './domain/repositories/suggestion-profile-lookup.repository';

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
 * AppModule. Only register the feature models here — never re-declare the
 * Sequelize provider in this module's providers array.
 *
 * ProfileAdminModel is re-registered here (cross-module pattern) so that
 * SequelizeSuggestionProfileLookupRepository can query the profiles table to
 * enrich the admin suggestion listing with doctor name and specialty.
 */
@Module({
  imports: [SequelizeModule.forFeature([DoctorSuggestionModel, ProfileAdminModel])],
  controllers: [SuggestionsController, AdminSuggestionsController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: SUGGESTION_REPOSITORY,
      useClass: SequelizeSuggestionRepository,
    },

    // Profile lookup: resolves doctor identity for admin listing (no N+1)
    {
      provide: SUGGESTION_PROFILE_LOOKUP_REPOSITORY,
      useClass: SequelizeSuggestionProfileLookupRepository,
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
