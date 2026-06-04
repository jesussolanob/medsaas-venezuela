import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
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
} from '../../application/dtos/billing.dtos';
import { ListSubscriptionPaymentsUseCase } from '../../application/use-cases/billing/list-subscription-payments.use-case';
import { ApproveSubscriptionPaymentUseCase } from '../../application/use-cases/billing/approve-subscription-payment.use-case';
import { RejectSubscriptionPaymentUseCase } from '../../application/use-cases/billing/reject-subscription-payment.use-case';
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
 * Admin controller for subscription payment management.
 *
 * All endpoints require DevAuthGuard + RolesGuard with 'super_admin'.
 * Replaces: apps/frontend/app/api/admin/payments/route.ts (+ approve, reject).
 */
@Controller('admin/subscription-payments')
@UseGuards(DevAuthGuard, RolesGuard)
@Roles('super_admin')
export class SubscriptionPaymentsController {
  constructor(
    private readonly listPayments: ListSubscriptionPaymentsUseCase,
    private readonly approvePayment: ApproveSubscriptionPaymentUseCase,
    private readonly rejectPayment: RejectSubscriptionPaymentUseCase,
  ) {}

  /**
   * GET /api/admin/subscription-payments?status=pending|approved|rejected
   */
  @Get()
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
  @Put(':id/approve')
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
  @Put(':id/reject')
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
