import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CreateContentTemplateDtoSchema,
  UpdateContentTemplateDtoSchema,
  ListContentTemplatesQuerySchema,
  type CreateContentTemplateDto,
  type UpdateContentTemplateDto,
  type ListContentTemplatesQuery,
} from '@delta/shared-types';

import { ListContentTemplatesUseCase } from '../../application/use-cases/list-content-templates.use-case';
import { GetContentTemplateUseCase } from '../../application/use-cases/get-content-template.use-case';
import { CreateContentTemplateUseCase } from '../../application/use-cases/create-content-template.use-case';
import { UpdateContentTemplateUseCase } from '../../application/use-cases/update-content-template.use-case';
import { DeleteContentTemplateUseCase } from '../../application/use-cases/delete-content-template.use-case';
import type { ContentTemplate } from '../../domain/entities/content-template.entity';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * ContentTemplatesController — CRUD for doctor-private content templates.
 *
 * All routes under /doctor/content-templates (global prefix `api` is set
 * on the NestJS app, so full path is /api/doctor/content-templates).
 *
 * SECURITY:
 *   - AppAuthGuard required on all endpoints.
 *   - doctorId is ALWAYS taken from user.sub (never from the request body).
 *   - Anti-IDOR: foreign and missing templates return the same 404.
 */
@Controller('doctor/content-templates')
@UseGuards(AppAuthGuard)
export class ContentTemplatesController {
  constructor(
    private readonly listUseCase: ListContentTemplatesUseCase,
    private readonly getUseCase: GetContentTemplateUseCase,
    private readonly createUseCase: CreateContentTemplateUseCase,
    private readonly updateUseCase: UpdateContentTemplateUseCase,
    private readonly deleteUseCase: DeleteContentTemplateUseCase,
  ) {}

  /**
   * GET /api/doctor/content-templates?type=recipe|paraclinical|reposo|presupuesto
   * Lists all templates for the doctor, ordered by name ASC.
   */
  @Get()
  async index(
    @Query(new ZodValidationPipe(ListContentTemplatesQuerySchema)) query: ListContentTemplatesQuery,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ContentTemplate[]>> {
    const templates = await this.listUseCase.execute(user.sub, query);
    return { success: true, data: templates };
  }

  /**
   * POST /api/doctor/content-templates
   * Creates a new content template. Returns 201.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateContentTemplateDtoSchema)) dto: CreateContentTemplateDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ContentTemplate>> {
    const template = await this.createUseCase.execute(dto, user.sub);
    return { success: true, data: template };
  }

  /**
   * GET /api/doctor/content-templates/:id
   * Returns a single template. 404 for missing or foreign.
   */
  @Get(':id')
  async show(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ContentTemplate>> {
    const template = await this.getUseCase.execute(id, user.sub);
    return { success: true, data: template };
  }

  /**
   * PUT /api/doctor/content-templates/:id
   * Updates name and/or content (type is immutable). 404 for missing or foreign.
   */
  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateContentTemplateDtoSchema)) dto: UpdateContentTemplateDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ContentTemplate>> {
    const template = await this.updateUseCase.execute(id, user.sub, dto);
    return { success: true, data: template };
  }

  /**
   * DELETE /api/doctor/content-templates/:id
   * Deletes a template. Returns 204 No Content.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.deleteUseCase.execute(id, user.sub);
  }
}
