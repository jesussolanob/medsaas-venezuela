import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { UpsertDoctorTemplateDtoSchema, type UpsertDoctorTemplateDto } from '@delta/shared-types';

import { ListDoctorTemplatesUseCase } from '../../application/use-cases/doctor-templates/list-doctor-templates.use-case';
import { UpsertDoctorTemplateUseCase } from '../../application/use-cases/doctor-templates/upsert-doctor-template.use-case';
import type { DoctorTemplate } from '../../domain/entities/doctor-template.entity';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * DoctorTemplatesController
 *
 * Manages PDF template configuration for doctors under /api/doctor/templates.
 *
 * SECURITY:
 *   - doctorId is ALWAYS taken from the authenticated user (user.sub).
 *   - Never trust doctor_id from the request body — anti-IDOR.
 *   - All endpoints require AppAuthGuard.
 *   - logo_url / signature_url are plain storage URLs — upload is handled separately (Fase 5).
 */
@Controller('doctor/templates')
@UseGuards(AppAuthGuard)
export class DoctorTemplatesController {
  constructor(
    private readonly listTemplates: ListDoctorTemplatesUseCase,
    private readonly upsertTemplate: UpsertDoctorTemplateUseCase,
  ) {}

  /**
   * GET /api/doctor/templates
   * Returns all PDF templates for the authenticated doctor.
   * May return an empty array when no templates have been configured yet.
   */
  @Get()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<SuccessResponse<DoctorTemplate[]>> {
    const templates = await this.listTemplates.execute(user.sub);
    return { success: true, data: templates };
  }

  /**
   * PUT /api/doctor/templates/:templateType
   * Upserts the template configuration for the given type.
   * Creates the row if it does not exist; updates if it does.
   * Valid templateType values: informe | recipe | prescripciones | reposo
   */
  @Put(':templateType')
  async upsert(
    @Param('templateType') templateType: string,
    @Body(new ZodValidationPipe(UpsertDoctorTemplateDtoSchema)) dto: UpsertDoctorTemplateDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<DoctorTemplate>> {
    const template = await this.upsertTemplate.execute(templateType, dto, user.sub);
    return { success: true, data: template };
  }
}
