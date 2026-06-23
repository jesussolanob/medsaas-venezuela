import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  RejectSubscriptionPaymentBodySchema,
  type RejectSubscriptionPaymentBody,
  RegisterManualPaymentBodySchema,
  type RegisterManualPaymentBody,
} from '../../application/dtos/billing.dtos';
import { ListSubscriptionPaymentsUseCase } from '../../application/use-cases/billing/list-subscription-payments.use-case';
import { ApproveSubscriptionPaymentUseCase } from '../../application/use-cases/billing/approve-subscription-payment.use-case';
import { RejectSubscriptionPaymentUseCase } from '../../application/use-cases/billing/reject-subscription-payment.use-case';
import { RegisterManualPaymentUseCase } from '../../application/use-cases/billing/register-manual-payment.use-case';
import { GetFinanceStatsUseCase } from '../../application/use-cases/billing/get-finance-stats.use-case';
import type { SubscriptionPaymentStatus } from '../../domain/entities/subscription-payment.entity';

const VALID_STATUSES: SubscriptionPaymentStatus[] = ['pending', 'approved', 'rejected'];

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
 * Controller for admin subscription payment management and finance KPIs.
 *
 * All endpoints require AppAuthGuard + RolesGuard with 'super_admin'.
 *
 * Routes:
 *   POST /api/admin/subscription-payments         — register manual payment (super_admin)
 *   GET  /api/admin/subscription-payments         — paginated payment list
 *   PUT  /api/admin/subscription-payments/:id/approve
 *   PUT  /api/admin/subscription-payments/:id/reject
 *   GET  /api/admin/finance-stats                 — aggregated finance KPIs
 */
@Controller('admin')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin')
export class SubscriptionPaymentsController {
  constructor(
    private readonly listPayments: ListSubscriptionPaymentsUseCase,
    private readonly approvePayment: ApproveSubscriptionPaymentUseCase,
    private readonly rejectPayment: RejectSubscriptionPaymentUseCase,
    private readonly registerManualPayment: RegisterManualPaymentUseCase,
    private readonly getFinanceStatsUseCase: GetFinanceStatsUseCase,
  ) {}

  /**
   * POST /api/admin/subscription-payments
   *
   * Registers a payment that was collected manually (cash, wire transfer, etc.)
   * and extends the doctor's subscription atomically — no comprobante flow needed.
   *
   * Body: { doctor_id, amount_usd, method, duration_months, reference_number? }
   */
  @Post('subscription-payments')
  async registerManual(
    @Body(new ZodValidationPipe(RegisterManualPaymentBodySchema))
    body: RegisterManualPaymentBody,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const result = await this.registerManualPayment.execute({
      doctorId: body.doctor_id,
      amountUsd: body.amount_usd,
      method: body.method,
      durationMonths: body.duration_months,
      referenceNumber: body.reference_number,
      reviewerId: user.sub,
    });
    return { success: true, data: this.toOutput(result) };
  }

  /**
   * GET /api/admin/subscription-payments?status=pending|approved|rejected
   */
  @Get('subscription-payments')
  async list(
    @Query('status') statusRaw?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<PaginatedResponse<unknown>> {
    const status =
      statusRaw && (VALID_STATUSES as string[]).includes(statusRaw)
        ? (statusRaw as SubscriptionPaymentStatus)
        : undefined;

    const result = await this.listPayments.execute({
      status,
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });

    return {
      success: true,
      data: result.items.map((p) => this.toOutput(p.toPlain())),
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /**
   * PUT /api/admin/subscription-payments/:id/approve
   */
  @Put('subscription-payments/:id/approve')
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<{ newExpiresAt: Date }>> {
    const result = await this.approvePayment.execute({
      paymentId: id,
      reviewerId: user.sub,
    });
    return { success: true, data: result };
  }

  /**
   * PUT /api/admin/subscription-payments/:id/reject
   * Body: { reason?: string }
   */
  @Put('subscription-payments/:id/reject')
  async reject(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(RejectSubscriptionPaymentBodySchema))
    body: RejectSubscriptionPaymentBody,
  ): Promise<SuccessResponse<{ rejected: true }>> {
    await this.rejectPayment.execute({
      paymentId: id,
      reviewerId: user.sub,
      reason: body.reason,
    });
    return { success: true, data: { rejected: true } };
  }

  /**
   * GET /api/admin/finance-stats
   *
   * Returns aggregated finance KPIs from subscription_payments:
   *   - MTD revenue vs previous month (momChange %)
   *   - Pending payments total + count
   *   - Total approved count
   *   - Monthly revenue buckets (last 6 months, es-VE short labels)
   *   - Top 20 recently-approved payments (doctor name)
   *   - Top 4 pending payments (doctor name + specialty) for the dashboard widget
   *
   * Cached in Redis (TTL 120s) with fallback to DB when Redis is unavailable.
   *
   * SECURITY: doctorName / specialty are doctor-level PII. This endpoint is
   * guarded at the class level by @Roles('super_admin').
   */
  @Get('finance-stats')
  async financeStats(): Promise<SuccessResponse<unknown>> {
    const data = await this.getFinanceStatsUseCase.execute();
    return { success: true, data };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toOutput(props: {
    id: string;
    doctorId: string;
    amountUsd: number;
    method: string;
    referenceNumber: string | null;
    durationMonths: number;
    status: SubscriptionPaymentStatus;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): unknown {
    return {
      id: props.id,
      doctorId: props.doctorId,
      amountUsd: props.amountUsd,
      method: props.method,
      referenceNumber: props.referenceNumber,
      durationMonths: props.durationMonths,
      status: props.status,
      reviewedBy: props.reviewedBy,
      reviewedAt: props.reviewedAt,
      createdAt: props.createdAt,
    };
  }
}
