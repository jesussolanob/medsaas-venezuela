import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  CreateLeadDtoSchema,
  UpdateLeadDtoSchema,
  UpdateLeadStageDtoSchema,
  LeadStageSchema,
  type CreateLeadDto,
  type UpdateLeadDto,
  type UpdateLeadStageDto,
  type LeadStageType,
} from '@delta/shared-types';

import { ListLeadsUseCase } from '../../application/use-cases/leads/list-leads.use-case';
import { CreateLeadUseCase } from '../../application/use-cases/leads/create-lead.use-case';
import { UpdateLeadUseCase } from '../../application/use-cases/leads/update-lead.use-case';
import { UpdateLeadStageUseCase } from '../../application/use-cases/leads/update-lead-stage.use-case';
import { DeleteLeadUseCase } from '../../application/use-cases/leads/delete-lead.use-case';
import { toLeadResponse } from '../mappers/lead.mapper';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Leads (CRM) controller.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * All endpoints require AppAuthGuard.
 *
 * SECURITY: doctorId is ALWAYS taken from the authenticated user (user.sub).
 * Never trust doctor_id from the request body — anti-IDOR.
 * NEVER log phone or contact info from leads.
 */
@Controller('doctor/leads')
@UseGuards(AppAuthGuard)
export class LeadsController {
  constructor(
    private readonly listLeads: ListLeadsUseCase,
    private readonly createLead: CreateLeadUseCase,
    private readonly updateLead: UpdateLeadUseCase,
    private readonly updateLeadStage: UpdateLeadStageUseCase,
    private readonly deleteLead: DeleteLeadUseCase,
  ) {}

  /**
   * GET /api/doctor/leads?stage=
   *
   * Returns all leads for the authenticated doctor, optionally filtered by stage.
   */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('stage') stage?: string,
  ): Promise<SuccessResponse<unknown[]>> {
    const validatedStage = this.parseOptionalStage(stage);
    const leads = await this.listLeads.execute({ doctorId: user.sub, stage: validatedStage });
    return { success: true, data: leads.map(toLeadResponse) };
  }

  /**
   * POST /api/doctor/leads
   *
   * Creates a new lead for the authenticated doctor.
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateLeadDtoSchema)) dto: CreateLeadDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const lead = await this.createLead.execute({
      doctorId: user.sub,
      name: dto.name,
      lastName: dto.last_name ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      channel: dto.channel ?? null,
      stage: dto.stage,
      message: dto.message ?? null,
      source: dto.source ?? null,
    });
    return { success: true, data: toLeadResponse(lead) };
  }

  /**
   * PUT /api/doctor/leads/:id
   *
   * Updates the editable fields of a lead (name, phone, channel, message).
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateLeadDtoSchema)) dto: UpdateLeadDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const lead = await this.updateLead.execute({
      leadId: id,
      doctorId: user.sub,
      name: dto.name,
      lastName: dto.last_name,
      email: dto.email,
      phone: dto.phone,
      channel: dto.channel ?? undefined,
      message: dto.message,
    });
    return { success: true, data: toLeadResponse(lead) };
  }

  /**
   * PUT /api/doctor/leads/:id/stage
   *
   * Updates only the stage field (kanban drag-and-drop use case).
   */
  @Put(':id/stage')
  async updateStage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateLeadStageDtoSchema)) dto: UpdateLeadStageDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const lead = await this.updateLeadStage.execute({
      leadId: id,
      doctorId: user.sub,
      stage: dto.stage,
    });
    return { success: true, data: toLeadResponse(lead) };
  }

  /**
   * DELETE /api/doctor/leads/:id
   *
   * Permanently deletes a lead. Returns 204 No Content on success.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.deleteLead.execute({ leadId: id, doctorId: user.sub });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private parseOptionalStage(stage: string | undefined): LeadStageType | undefined {
    if (!stage) return undefined;
    const parsed = LeadStageSchema.safeParse(stage);
    if (!parsed.success) return undefined;
    return parsed.data;
  }
}
