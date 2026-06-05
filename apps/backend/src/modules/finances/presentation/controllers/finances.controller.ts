import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { RecordFinanceEntryDtoSchema, type RecordFinanceEntryDto } from '@delta/shared-types';

import {
  GetFinancialSummaryUseCase,
  type GetFinancialSummaryOutput,
} from '../../application/use-cases/finances/get-financial-summary.use-case';
import {
  RecordIncomeUseCase,
  type RecordIncomeOutput,
} from '../../application/use-cases/finances/record-income.use-case';
import {
  RecordExpenseUseCase,
  type RecordExpenseOutput,
} from '../../application/use-cases/finances/record-expense.use-case';
import {
  ListTransactionsUseCase,
  type TransactionItem,
} from '../../application/use-cases/finances/list-transactions.use-case';
import { DeleteTransactionUseCase } from '../../application/use-cases/finances/delete-transaction.use-case';
import {
  GetLifetimeIncomeUseCase,
  type GetLifetimeIncomeOutput,
} from '../../application/use-cases/finances/get-lifetime-income.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: { total: number; page: number; limit: number };
}

/**
 * Validates that a month query param matches 'YYYY-MM' and has a valid month number.
 * Returns undefined when the param is absent.
 * Throws BadRequestException for any invalid value.
 */
function parseOptionalMonth(value: string | undefined, param: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) {
    throw new BadRequestException(
      `Query parameter "${param}" must be in YYYY-MM format with a valid month (01–12)`,
    );
  }
  return value;
}

/**
 * Finances controller — scoped to /api/finances.
 *
 * SECURITY: doctor_id is ALWAYS taken from the authenticated user (user.sub).
 * Never trust doctor_id from the request body — anti-IDOR.
 *
 * All endpoints require DevAuthGuard (Etapa 1 only).
 */
@Controller('finances')
@UseGuards(DevAuthGuard)
export class FinancesController {
  constructor(
    private readonly getSummary: GetFinancialSummaryUseCase,
    private readonly recordIncome: RecordIncomeUseCase,
    private readonly recordExpense: RecordExpenseUseCase,
    private readonly listTransactions: ListTransactionsUseCase,
    private readonly deleteTransaction: DeleteTransactionUseCase,
    private readonly getLifetimeIncome: GetLifetimeIncomeUseCase,
  ) {}

  /**
   * GET /api/finances/summary
   * GET /api/finances/summary?month=YYYY-MM
   */
  @Get('summary')
  async summary(
    @CurrentUser() user: CurrentUserPayload,
    @Query('month') month?: string,
  ): Promise<SuccessResponse<GetFinancialSummaryOutput>> {
    const validatedMonth = parseOptionalMonth(month, 'month');
    const result = await this.getSummary.execute({
      doctorId: user.sub,
      month: validatedMonth,
    });
    return { success: true, data: result };
  }

  /** GET /api/finances/transactions?month=YYYY-MM&page=1&limit=20 */
  @Get('transactions')
  async transactions(
    @CurrentUser() user: CurrentUserPayload,
    @Query('month') month?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<PaginatedResponse<TransactionItem>> {
    const result = await this.listTransactions.execute({
      doctorId: user.sub,
      month: parseOptionalMonth(month, 'month'),
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });

    return {
      success: true,
      data: result.items,
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /** POST /api/finances/income */
  @Post('income')
  async income(
    @Body(new ZodValidationPipe(RecordFinanceEntryDtoSchema)) dto: RecordFinanceEntryDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<RecordIncomeOutput>> {
    const result = await this.recordIncome.execute({
      doctorId: user.sub,
      amount: dto.amount,
      currency: dto.currency ?? 'USD',
      description: dto.description,
      relatedConsultationId: dto.related_consultation_id ?? null,
      date: dto.date ? new Date(dto.date) : undefined,
    });
    return { success: true, data: result };
  }

  /**
   * GET /api/finances/lifetime
   * Returns all-time income totals for the doctor (not month-scoped).
   * Used for the "Ingresos totales" KPI on the dashboard.
   */
  @Get('lifetime')
  async lifetime(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<GetLifetimeIncomeOutput>> {
    const result = await this.getLifetimeIncome.execute(user.sub);
    return { success: true, data: result };
  }

  /**
   * DELETE /api/finances/transactions/:id
   * Deletes a financial transaction owned by the calling doctor.
   * SECURITY: doctorId is from the authenticated user — anti-IDOR.
   */
  @Delete('transactions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTransactionHandler(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.deleteTransaction.execute({ transactionId: id, doctorId: user.sub });
  }

  /** POST /api/finances/expense */
  @Post('expense')
  async expense(
    @Body(new ZodValidationPipe(RecordFinanceEntryDtoSchema)) dto: RecordFinanceEntryDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<RecordExpenseOutput>> {
    const result = await this.recordExpense.execute({
      doctorId: user.sub,
      amount: dto.amount,
      currency: dto.currency ?? 'USD',
      description: dto.description,
      relatedConsultationId: dto.related_consultation_id ?? null,
      date: dto.date ? new Date(dto.date) : undefined,
    });
    return { success: true, data: result };
  }
}
