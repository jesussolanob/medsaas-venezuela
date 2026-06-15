import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
  RegisterPaymentDtoSchema,
  RejectPaymentDtoSchema,
  type RegisterPaymentDto,
  type RejectPaymentDto,
} from '@delta/shared-types';

import { ListConsultationPaymentsUseCase } from '../../application/use-cases/payments/list-consultation-payments.use-case';
import { RegisterConsultationPaymentUseCase } from '../../application/use-cases/payments/register-consultation-payment.use-case';
import { ApproveConsultationPaymentUseCase } from '../../application/use-cases/payments/approve-consultation-payment.use-case';
import { RejectConsultationPaymentUseCase } from '../../application/use-cases/payments/reject-consultation-payment.use-case';
import { toPaymentResponse } from '../mappers/consultation-payment.mapper';
import type { PaymentStatus } from '../../domain/entities/consultation-payment.entity';

const PAYMENT_STATUS_VALUES: readonly PaymentStatus[] = ['pending', 'approved', 'rejected'];

function parseOptionalPaymentStatus(value: string | undefined): PaymentStatus | undefined {
  if (!value) return undefined;
  if (!PAYMENT_STATUS_VALUES.includes(value as PaymentStatus)) {
    throw new BadRequestException(
      `Query parameter "status" must be one of: ${PAYMENT_STATUS_VALUES.join(', ')}`,
    );
  }
  return value as PaymentStatus;
}

function parsePositiveInt(
  value: string | undefined,
  name: string,
  defaultVal: number,
  max?: number,
): number {
  if (!value) return defaultVal;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0) {
    throw new BadRequestException(`Query parameter "${name}" must be a non-negative integer`);
  }
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: { total: number; limit: number; offset: number };
}

/**
 * Payments controller.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * All endpoints require AppAuthGuard.
 *
 * SECURITY: doctor_id is ALWAYS taken from the authenticated user (user.sub).
 * Never trust doctor_id from the request body — anti-IDOR.
 *
 * Patient PII is never returned in responses — only patient_id is exposed.
 */
@Controller('doctor/payments')
@UseGuards(AppAuthGuard)
export class PaymentsController {
  constructor(
    private readonly listPayments: ListConsultationPaymentsUseCase,
    private readonly registerPayment: RegisterConsultationPaymentUseCase,
    private readonly approvePayment: ApproveConsultationPaymentUseCase,
    private readonly rejectPayment: RejectConsultationPaymentUseCase,
  ) {}

  /**
   * GET /api/doctor/payments
   *
   * Paginated list of payments for the authenticated doctor.
   * Optional filters: consultation_id, status, limit, offset.
   */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('consultation_id') consultationId?: string,
    @Query('status') status?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ): Promise<PaginatedResponse<unknown>> {
    const parsedLimit = parsePositiveInt(limit, 'limit', 50, 100);
    const parsedOffset = parsePositiveInt(offset, 'offset', 0);
    const parsedStatus = parseOptionalPaymentStatus(status);

    const result = await this.listPayments.execute({
      doctorId: user.sub,
      consultationId,
      status: parsedStatus,
      limit: parsedLimit,
      offset: parsedOffset,
    });

    return {
      success: true,
      data: result.items.map(toPaymentResponse),
      meta: { total: result.total, limit: parsedLimit, offset: parsedOffset },
    };
  }

  /**
   * POST /api/doctor/payments
   *
   * Registers a new payment for a consultation.
   * Verifies the consultation belongs to the authenticated doctor.
   */
  @Post()
  async register(
    @Body(new ZodValidationPipe(RegisterPaymentDtoSchema)) dto: RegisterPaymentDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const payment = await this.registerPayment.execute({
      doctorId: user.sub,
      consultationId: dto.consultation_id,
      patientId: dto.patient_id,
      amount: dto.amount,
      currency: dto.currency ?? 'USD',
      paymentMethod: dto.payment_method,
      referenceNumber: dto.reference_number ?? null,
      receiptUrl: dto.receipt_url ?? null,
      notes: dto.notes ?? null,
    });

    return { success: true, data: toPaymentResponse(payment) };
  }

  /**
   * PUT /api/doctor/payments/:id/approve
   *
   * Transitions a payment from pending → approved.
   * Throws PaymentAlreadyResolvedError if not in pending state.
   */
  @Put(':id/approve')
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const payment = await this.approvePayment.execute({
      paymentId: id,
      doctorId: user.sub,
    });

    return { success: true, data: toPaymentResponse(payment) };
  }

  /**
   * PUT /api/doctor/payments/:id/reject
   *
   * Transitions a payment from pending → rejected.
   * Accepts optional notes in the body.
   */
  @Put(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RejectPaymentDtoSchema)) dto: RejectPaymentDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const payment = await this.rejectPayment.execute({
      paymentId: id,
      doctorId: user.sub,
      notes: dto.notes ?? null,
    });

    return { success: true, data: toPaymentResponse(payment) };
  }
}
