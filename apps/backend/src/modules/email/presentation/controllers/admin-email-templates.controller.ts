import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { UpdateEmailTemplateDtoSchema, type UpdateEmailTemplateDto } from '@delta/shared-types';
import { ListEmailTemplatesUseCase } from '../../application/use-cases/list-email-templates.use-case';
import type { EmailTemplateSummary } from '../../application/use-cases/list-email-templates.use-case';
import { GetEmailTemplateUseCase } from '../../application/use-cases/get-email-template.use-case';
import type { EmailTemplateDetail } from '../../application/use-cases/get-email-template.use-case';
import { UpdateEmailTemplateUseCase } from '../../application/use-cases/update-email-template.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * AdminEmailTemplatesController — CRUD-lite for email templates.
 *
 * Templates are created/deleted via migrations only; this controller allows
 * super_admins to view and edit the content of existing templates.
 *
 * All endpoints require AppAuthGuard + RolesGuard with @Roles('super_admin').
 *
 * GET  /api/admin/email-templates       → summary list (no html/text)
 * GET  /api/admin/email-templates/:name → full detail (with html/text)
 * PUT  /api/admin/email-templates/:name → partial update
 *
 * SECURITY: html is stored raw and used only in transactional emails —
 * it is never rendered in the browser DOM. Only super_admin can write here.
 */
@Controller('admin/email-templates')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminEmailTemplatesController {
  constructor(
    private readonly listTemplates: ListEmailTemplatesUseCase,
    private readonly getTemplate: GetEmailTemplateUseCase,
    private readonly updateTemplate: UpdateEmailTemplateUseCase,
  ) {}

  /**
   * GET /api/admin/email-templates
   *
   * Returns a summary of all templates (no html/text) ordered by name ASC.
   * Response: { success: true, data: EmailTemplateSummary[] }
   */
  @Get()
  async list(): Promise<SuccessResponse<EmailTemplateSummary[]>> {
    const summaries = await this.listTemplates.execute();
    return { success: true, data: summaries };
  }

  /**
   * GET /api/admin/email-templates/:name
   *
   * Returns the full content (including html and text) for one template.
   * Response: { success: true, data: EmailTemplateDetail }
   * Error: { success: false, error: { code: 'EMAIL_TEMPLATE_NOT_FOUND', message: string } } (404)
   */
  @Get(':name')
  async getOne(@Param('name') name: string): Promise<SuccessResponse<EmailTemplateDetail>> {
    const detail = await this.getTemplate.execute(name);
    return { success: true, data: detail };
  }

  /**
   * PUT /api/admin/email-templates/:name
   *
   * Applies a partial update. Omitted fields are left unchanged.
   * Body: { subject?: string; html?: string; text?: string | null; is_active?: boolean }
   * Response: { success: true, data: EmailTemplateDetail }
   * Error: { success: false, error: { code: 'EMAIL_TEMPLATE_NOT_FOUND', message: string } } (404)
   */
  @Put(':name')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(UpdateEmailTemplateDtoSchema)) dto: UpdateEmailTemplateDto,
  ): Promise<SuccessResponse<EmailTemplateDetail>> {
    const updated = await this.updateTemplate.execute(name, {
      subject: dto.subject,
      html: dto.html,
      text: dto.text,
      isActive: dto.is_active,
    });
    return { success: true, data: updated };
  }
}
