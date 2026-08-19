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
  RecordFinanceEntryDtoSchema,
  type RecordFinanceEntryDto,
  CreateIncomeConceptDtoSchema,
  type CreateIncomeConceptDto,
  UpdateIncomeConceptDtoSchema,
  type UpdateIncomeConceptDto,
  UpdateTransactionDtoSchema,
  type UpdateTransactionDto,
} from '@delta/shared-types';

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
import {
  ListIncomeConceptsUseCase,
  type IncomeConceptItem,
} from '../../application/use-cases/finances/list-income-concepts.use-case';
import {
  CreateIncomeConceptUseCase,
  type IncomeConceptOutput,
} from '../../application/use-cases/finances/create-income-concept.use-case';
import { UpdateIncomeConceptUseCase } from '../../application/use-cases/finances/update-income-concept.use-case';
import { DeleteIncomeConceptUseCase } from '../../application/use-cases/finances/delete-income-concept.use-case';
import {
  UpdateTransactionUseCase,
  type UpdateTransactionOutput,
} from '../../application/use-cases/finances/update-transaction.use-case';
import {
  ListIncomeTransactionsUseCase,
  type IncomeTransactionOutput,
} from '../../application/use-cases/finances/list-income-transactions.use-case';
import {
  INCOME_TX_DEFAULT_LIMIT,
  INCOME_TX_MAX_LIMIT,
} from '../../application/constants/income-transactions.constants';
import {
  ListIncomeUseCase,
  type IncomeListItemOutput,
} from '../../application/use-cases/finances/list-income.use-case';

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
      `El parámetro "${param}" debe tener el formato AAAA-MM con un mes válido (01–12)`,
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
 * All endpoints require AppAuthGuard.
 */
@Controller('finances')
@UseGuards(AppAuthGuard)
export class FinancesController {
  constructor(
    private readonly getSummary: GetFinancialSummaryUseCase,
    private readonly recordIncome: RecordIncomeUseCase,
    private readonly recordExpense: RecordExpenseUseCase,
    private readonly listTransactions: ListTransactionsUseCase,
    private readonly deleteTransaction: DeleteTransactionUseCase,
    private readonly getLifetimeIncome: GetLifetimeIncomeUseCase,
    private readonly listIncomeConcepts: ListIncomeConceptsUseCase,
    private readonly createIncomeConcept: CreateIncomeConceptUseCase,
    private readonly updateIncomeConcept: UpdateIncomeConceptUseCase,
    private readonly deleteIncomeConcept: DeleteIncomeConceptUseCase,
    private readonly updateTransaction: UpdateTransactionUseCase,
    private readonly listIncomeTransactions: ListIncomeTransactionsUseCase,
    private readonly listIncome: ListIncomeUseCase,
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
      conceptId: dto.conceptId ?? null,
      patientId: dto.patientId ?? null,
    });
    return { success: true, data: result };
  }

  /**
   * GET /api/finances/income-transactions
   * GET /api/finances/income-transactions?month=YYYY-MM&limit=100
   *
   * Returns manual income entries with decrypted patient name for the finance chart.
   * SECURITY: doctorId from authenticated token (anti-IDOR). No PII is logged.
   */
  @Get('income-transactions')
  async incomeTransactions(
    @CurrentUser() user: CurrentUserPayload,
    @Query('month') month?: string,
    @Query('limit') limit = String(INCOME_TX_DEFAULT_LIMIT),
  ): Promise<SuccessResponse<IncomeTransactionOutput[]>> {
    const validatedMonth = parseOptionalMonth(month, 'month');
    const result = await this.listIncomeTransactions.execute({
      doctorId: user.sub,
      month: validatedMonth,
      limit: Math.min(
        INCOME_TX_MAX_LIMIT,
        Math.max(1, parseInt(limit, 10) || INCOME_TX_DEFAULT_LIMIT),
      ),
    });
    return { success: true, data: result };
  }

  /**
   * GET /api/finances/income?month=YYYY-MM&page=1&limit=20
   *
   * Unified paginated income list combining:
   *   - Consultation payments (`payments` table, all statuses)
   *   - Manual income entries (`financial_transactions` WHERE type='income')
   *
   * Results are sorted by date DESC and paginated server-side.
   * Cap: limit max 100.
   *
   * SECURITY: doctorId is ALWAYS from the authenticated token (anti-IDOR).
   * No patient PII (name, cedula, phone) is returned — only patient_id.
   */
  @Get('income')
  async incomeList(
    @CurrentUser() user: CurrentUserPayload,
    @Query('month') month?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<PaginatedResponse<IncomeListItemOutput>> {
    const result = await this.listIncome.execute({
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
      concept: dto.concept ?? null,
    });
    return { success: true, data: result };
  }

  // ---------------------------------------------------------------------------
  // Feature A — Income concepts
  // ---------------------------------------------------------------------------

  /**
   * GET /api/finances/income-concepts
   * Returns active income concepts for the authenticated doctor, ordered by sort_order ASC.
   */
  @Get('income-concepts')
  async listConcepts(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<IncomeConceptItem[]>> {
    const result = await this.listIncomeConcepts.execute(user.sub);
    return { success: true, data: result };
  }

  /**
   * POST /api/finances/income-concepts
   * Creates a new income concept for the authenticated doctor.
   */
  @Post('income-concepts')
  async createConcept(
    @Body(new ZodValidationPipe(CreateIncomeConceptDtoSchema)) dto: CreateIncomeConceptDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<IncomeConceptOutput>> {
    const result = await this.createIncomeConcept.execute({
      doctorId: user.sub,
      name: dto.name,
    });
    return { success: true, data: result };
  }

  /**
   * PUT /api/finances/income-concepts/:id
   * Updates name, isActive, or sortOrder of an existing concept.
   * Ownership enforced — throws 403 if concept belongs to another doctor.
   */
  @Put('income-concepts/:id')
  async updateConcept(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateIncomeConceptDtoSchema)) dto: UpdateIncomeConceptDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<IncomeConceptOutput>> {
    const result = await this.updateIncomeConcept.execute({
      id,
      doctorId: user.sub,
      name: dto.name,
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
    });
    return { success: true, data: result };
  }

  /**
   * DELETE /api/finances/income-concepts/:id
   * Soft-deletes the concept (is_active = false).
   * Hard delete is NOT used to preserve FK integrity with income transactions.
   */
  @Delete('income-concepts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConcept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.deleteIncomeConcept.execute({ id, doctorId: user.sub });
  }

  // ---------------------------------------------------------------------------
  // Feature B — Edit transactions
  // ---------------------------------------------------------------------------

  /**
   * PUT /api/finances/transactions/:id
   * Edits description, amount, currency, transactionDate, or conceptId (income only).
   * type and doctorId are immutable.
   * Ownership enforced — throws 403 if transaction belongs to another doctor.
   */
  @Put('transactions/:id')
  async updateTransactionHandler(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTransactionDtoSchema)) dto: UpdateTransactionDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<UpdateTransactionOutput>> {
    const result = await this.updateTransaction.execute({
      transactionId: id,
      doctorId: user.sub,
      description: dto.description,
      amount: dto.amount,
      currency: dto.currency,
      transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : undefined,
      conceptId: dto.conceptId,
      patientId: dto.patientId,
    });
    return { success: true, data: result };
  }
}
