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
  CreateQuoteDtoSchema,
  UpdateQuoteDtoSchema,
  UpdateQuoteStatusDtoSchema,
  SendQuoteDtoSchema,
  ListQuotesQuerySchema,
  type CreateQuoteDto,
  type UpdateQuoteDto,
  type UpdateQuoteStatusDto,
  type SendQuoteDto,
  type ListQuotesQuery,
} from '@delta/shared-types';

import { CreateQuoteUseCase } from '../../application/use-cases/create-quote.use-case';
import { GetQuoteUseCase } from '../../application/use-cases/get-quote.use-case';
import { ListQuotesUseCase } from '../../application/use-cases/list-quotes.use-case';
import { UpdateQuoteUseCase } from '../../application/use-cases/update-quote.use-case';
import { DeleteQuoteUseCase } from '../../application/use-cases/delete-quote.use-case';
import { SendQuoteUseCase } from '../../application/use-cases/send-quote.use-case';
import { UpdateQuoteStatusUseCase } from '../../application/use-cases/update-quote-status.use-case';
import type { Quote } from '../../domain/entities/quote.entity';
import type { QuoteListResult } from '../../domain/repositories/iquote.repository';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface SuccessListResponse<T> {
  success: true;
  data: T[];
  meta: { total: number; page: number; limit: number };
}

/**
 * QuotesController — CRUD + send operations for the Quotes module.
 *
 * All routes under /api/doctor/quotes.
 *
 * SECURITY:
 *   - AppAuthGuard required on all endpoints.
 *   - doctorId is ALWAYS taken from user.sub (never from the request body).
 *   - Anti-IDOR: foreign and missing quotes return the same 404.
 */
@Controller('doctor/quotes')
@UseGuards(AppAuthGuard)
export class QuotesController {
  constructor(
    private readonly listQuotes: ListQuotesUseCase,
    private readonly getQuote: GetQuoteUseCase,
    private readonly createQuote: CreateQuoteUseCase,
    private readonly updateQuote: UpdateQuoteUseCase,
    private readonly deleteQuote: DeleteQuoteUseCase,
    private readonly sendQuote: SendQuoteUseCase,
    private readonly updateStatus: UpdateQuoteStatusUseCase,
  ) {}

  /**
   * GET /api/doctor/quotes
   * Paginated list with optional status + product name filters.
   */
  @Get()
  async index(
    @Query(new ZodValidationPipe(ListQuotesQuerySchema)) query: ListQuotesQuery,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessListResponse<Quote>> {
    const result: QuoteListResult = await this.listQuotes.execute(user.sub, query);
    return {
      success: true,
      data: result.items,
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /**
   * POST /api/doctor/quotes
   * Creates a new draft quote.
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateQuoteDtoSchema)) dto: CreateQuoteDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<Quote>> {
    const quote = await this.createQuote.execute(dto, user.sub);
    return { success: true, data: quote };
  }

  /**
   * GET /api/doctor/quotes/:id
   * Returns a single quote with its items. 404 for missing or foreign.
   */
  @Get(':id')
  async show(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<Quote>> {
    const quote = await this.getQuote.execute(id, user.sub);
    return { success: true, data: quote };
  }

  /**
   * PUT /api/doctor/quotes/:id
   * Updates a draft quote. Replaces items if provided.
   */
  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateQuoteDtoSchema)) dto: UpdateQuoteDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<Quote>> {
    const quote = await this.updateQuote.execute(id, user.sub, dto);
    return { success: true, data: quote };
  }

  /**
   * DELETE /api/doctor/quotes/:id
   * Deletes a draft quote. Returns 204 No Content.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.deleteQuote.execute(id, user.sub);
  }

  /**
   * POST /api/doctor/quotes/:id/send
   * Emits the quote: freezes rate, creates share link, sends email, status → sent.
   */
  @Post(':id/send')
  async send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SendQuoteDtoSchema)) dto: SendQuoteDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<Quote>> {
    // doctorName is sourced from the user profile — for Phase 1 we use the user.sub
    // as a fallback; the frontend can send the display name via the DTO if needed.
    // doctorName is now resolved inside SendQuoteUseCase from profiles.full_name.
    // Never use user.email — that's the Auth0 email, not the display name.
    const quote = await this.sendQuote.execute({
      quoteId: id,
      doctorId: user.sub,
      recipientEmail: dto.recipient_email ?? undefined,
      recipientName: dto.recipient_name ?? undefined,
    });
    return { success: true, data: quote };
  }

  /**
   * PUT /api/doctor/quotes/:id/status
   * Updates the status (accepted | rejected | expired).
   */
  @Put(':id/status')
  async updateQuoteStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateQuoteStatusDtoSchema)) dto: UpdateQuoteStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<Quote>> {
    const quote = await this.updateStatus.execute(id, user.sub, dto);
    return { success: true, data: quote };
  }
}
