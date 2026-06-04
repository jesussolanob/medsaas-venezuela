import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { LeadModel } from './infrastructure/persistence/models/lead.model';
import { SequelizeLeadRepository } from './infrastructure/persistence/repositories/sequelize-lead.repository';
import { LEAD_REPOSITORY } from './domain/repositories/lead.repository';

import { ListLeadsUseCase } from './application/use-cases/leads/list-leads.use-case';
import { CreateLeadUseCase } from './application/use-cases/leads/create-lead.use-case';
import { UpdateLeadUseCase } from './application/use-cases/leads/update-lead.use-case';
import { UpdateLeadStageUseCase } from './application/use-cases/leads/update-lead-stage.use-case';
import { DeleteLeadUseCase } from './application/use-cases/leads/delete-lead.use-case';

import { LeadsController } from './presentation/controllers/leads.controller';

/**
 * LeadsModule — CRM prospects for doctors.
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature model (LeadModel) here — never re-declare
 * the Sequelize provider in this module's providers array.
 */
@Module({
  imports: [SequelizeModule.forFeature([LeadModel])],
  controllers: [LeadsController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: LEAD_REPOSITORY,
      useClass: SequelizeLeadRepository,
    },

    // Use cases
    ListLeadsUseCase,
    CreateLeadUseCase,
    UpdateLeadUseCase,
    UpdateLeadStageUseCase,
    DeleteLeadUseCase,
  ],
})
export class LeadsModule {}
