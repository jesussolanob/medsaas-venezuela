import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Infrastructure
import { ContentTemplateModel } from './infrastructure/persistence/models/content-template.model';
import { CONTENT_TEMPLATE_REPOSITORY } from './domain/repositories/icontent-template.repository';
import { SequelizeContentTemplateRepository } from './infrastructure/persistence/repositories/sequelize-content-template.repository';

// Use cases
import { ListContentTemplatesUseCase } from './application/use-cases/list-content-templates.use-case';
import { GetContentTemplateUseCase } from './application/use-cases/get-content-template.use-case';
import { CreateContentTemplateUseCase } from './application/use-cases/create-content-template.use-case';
import { UpdateContentTemplateUseCase } from './application/use-cases/update-content-template.use-case';
import { DeleteContentTemplateUseCase } from './application/use-cases/delete-content-template.use-case';

// Controller
import { ContentTemplatesController } from './presentation/controllers/content-templates.controller';

/**
 * ContentTemplatesModule — doctor-private content templates.
 *
 * Plan gating: delta_base + delta_plus + free_trial → enabled
 * (seeded in migration 20261022000001 Part 4).
 *
 * IMPORTANT: Sequelize is NOT in providers[] — already registered globally
 * by SequelizeModule.forRootAsync in AppModule. Adding it here causes a
 * boot crash.
 */
@Module({
  imports: [SequelizeModule.forFeature([ContentTemplateModel])],
  controllers: [ContentTemplatesController],
  providers: [
    {
      provide: CONTENT_TEMPLATE_REPOSITORY,
      useClass: SequelizeContentTemplateRepository,
    },
    ListContentTemplatesUseCase,
    GetContentTemplateUseCase,
    CreateContentTemplateUseCase,
    UpdateContentTemplateUseCase,
    DeleteContentTemplateUseCase,
  ],
})
export class ContentTemplatesModule {}
