import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  SuggestionStatusSchema,
  RespondSuggestionDtoSchema,
  type RespondSuggestionDto,
  type SuggestionStatusType,
} from '@delta/shared-types';

import { ListAllSuggestionsUseCase } from '../../application/use-cases/suggestions/list-all-suggestions.use-case';
import { RespondSuggestionUseCase } from '../../application/use-cases/suggestions/respond-suggestion.use-case';
import { toSuggestionResponse } from '../mappers/suggestion.mapper';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Admin suggestions controller — all endpoints require AppAuthGuard
 * and RolesGuard with @Roles('super_admin') (authorization).
 *
 * The @Roles('super_admin') and @UseGuards are applied at the class level so
 * every endpoint in this controller is protected — there are no gaps.
 */
@Controller('admin/suggestions')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminSuggestionsController {
  constructor(
    private readonly listAllSuggestions: ListAllSuggestionsUseCase,
    private readonly respondSuggestion: RespondSuggestionUseCase,
  ) {}

  /**
   * GET /api/admin/suggestions?status=
   *
   * Returns all suggestions across all doctors, optionally filtered by status.
   */
  @Get()
  async listAll(@Query('status') statusRaw?: string): Promise<SuccessResponse<unknown[]>> {
    const status = this.parseOptionalStatus(statusRaw);
    const suggestions = await this.listAllSuggestions.execute({ status });
    return { success: true, data: suggestions.map(toSuggestionResponse) };
  }

  /**
   * PUT /api/admin/suggestions/:id
   *
   * Updates the status (and optionally admin_response) of a suggestion.
   */
  @Put(':id')
  async respond(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RespondSuggestionDtoSchema)) dto: RespondSuggestionDto,
  ): Promise<SuccessResponse<unknown>> {
    const suggestion = await this.respondSuggestion.execute({
      suggestionId: id,
      status: dto.status,
      adminResponse: dto.admin_response ?? null,
    });
    return { success: true, data: toSuggestionResponse(suggestion) };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private parseOptionalStatus(status: string | undefined): SuggestionStatusType | undefined {
    if (!status) return undefined;
    const parsed = SuggestionStatusSchema.safeParse(status);
    if (!parsed.success) return undefined;
    return parsed.data;
  }
}
