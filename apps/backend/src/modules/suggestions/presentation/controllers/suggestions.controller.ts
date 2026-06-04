import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { CreateSuggestionDtoSchema, type CreateSuggestionDto } from '@delta/shared-types';

import { ListMySuggestionsUseCase } from '../../application/use-cases/suggestions/list-my-suggestions.use-case';
import { CreateSuggestionUseCase } from '../../application/use-cases/suggestions/create-suggestion.use-case';
import { toSuggestionResponse } from '../mappers/suggestion.mapper';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Doctor suggestions controller.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * All endpoints require DevAuthGuard (Etapa 1 only).
 *
 * SECURITY: doctorId is ALWAYS taken from the authenticated user (user.sub).
 * Never trust doctor_id from the request body — anti-IDOR.
 */
@Controller('doctor/suggestions')
@UseGuards(DevAuthGuard)
export class SuggestionsController {
  constructor(
    private readonly listMySuggestions: ListMySuggestionsUseCase,
    private readonly createSuggestion: CreateSuggestionUseCase,
  ) {}

  /**
   * GET /api/doctor/suggestions
   *
   * Returns all suggestions submitted by the authenticated doctor.
   */
  @Get()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<SuccessResponse<unknown[]>> {
    const suggestions = await this.listMySuggestions.execute({ doctorId: user.sub });
    return { success: true, data: suggestions.map(toSuggestionResponse) };
  }

  /**
   * POST /api/doctor/suggestions
   *
   * Submits a new suggestion from the authenticated doctor.
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateSuggestionDtoSchema)) dto: CreateSuggestionDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const suggestion = await this.createSuggestion.execute({
      doctorId: user.sub,
      subject: dto.subject,
      message: dto.message,
      category: dto.category,
    });
    return { success: true, data: toSuggestionResponse(suggestion) };
  }
}
