import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { GetCheckoutInfoUseCase } from '../../application/use-cases/billing/get-checkout-info.use-case';
import { SubmitDoctorPaymentUseCase } from '../../application/use-cases/billing/submit-doctor-payment.use-case';
import { ListDoctorPaymentsUseCase } from '../../application/use-cases/billing/list-doctor-payments.use-case';
import { z } from 'zod';
import { BankCodeSchema } from '@delta/shared-types';
import type { SubscriptionPayment } from '../../domain/entities/subscription-payment.entity';

// ---------------------------------------------------------------------------
// Local Zod schemas (billing-specific, not shared)
// ---------------------------------------------------------------------------

const VALID_PERIODS = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;

const SubmitDoctorPaymentBodySchema = z
  .object({
    planKey: z.string().min(1, 'planKey es requerido'),
    period: z.enum(VALID_PERIODS, {
      error: 'El período debe ser: monthly, quarterly, semiannual o annual',
    }),
    bankCode: BankCodeSchema,
    /**
     * Reference number: 4–40 alphanumeric/dash characters.
     * Whitespace is stripped by the use case.
     */
    referenceNumber: z
      .string()
      .min(4, 'El número de referencia debe tener al menos 4 caracteres')
      .max(40, 'El número de referencia no puede exceder 40 caracteres')
      .regex(
        /^[A-Za-z0-9-]+$/,
        'El número de referencia solo puede contener letras, números y guiones',
      ),
    /**
     * GCS path returned by POST /api/storage/upload.
     * Must start with "receipt/{userId}/" — validated server-side (anti-IDOR).
     */
    receiptPath: z.string().min(1, 'El comprobante es requerido'),
    notes: z.string().max(500).optional(),
  })
  .strict();

type SubmitDoctorPaymentBody = z.infer<typeof SubmitDoctorPaymentBodySchema>;

export const CheckoutInfoQuerySchema = z
  .object({
    planKey: z.string().min(1, 'planKey es requerido'),
    period: z.enum(VALID_PERIODS, {
      error: 'El período debe ser: monthly, quarterly, semiannual o annual',
    }),
  })
  .strict();

type CheckoutInfoQuery = z.infer<typeof CheckoutInfoQuerySchema>;

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

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
 * Maps a SubscriptionPayment entity to the doctor-facing history item output.
 * Deliberately excludes receiptUrl (raw GCS path) — never expose it to clients.
 */
function toDoctorPaymentOutput(p: SubscriptionPayment) {
  return {
    id: p.id,
    planKey: p.planKey,
    period: p.period,
    amountUsd: p.amountUsd,
    amountBs: p.amountBs,
    bcvRateUsed: p.bcvRateUsed,
    bankCode: p.bankCode,
    referenceNumber: p.referenceNumber,
    status: p.status,
    rejectionReason: p.rejectionReason,
    createdAt: p.createdAt,
    reviewedAt: p.reviewedAt,
    hasReceipt: p.receiptUrl !== null,
  };
}

/**
 * Controller for doctor self-service subscription payment endpoints.
 *
 * Routes:
 *   GET  /api/doctor/subscription-payments/checkout-info?planKey=&period=
 *   POST /api/doctor/subscription-payments
 *   GET  /api/doctor/subscription-payments
 *
 * All routes require AppAuthGuard + RolesGuard with 'doctor'.
 * doctorId is ALWAYS taken from the auth token (user.sub) — never from the body.
 */
@Controller('doctor/subscription-payments')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('doctor')
export class DoctorSubscriptionPaymentsController {
  constructor(
    private readonly getCheckoutInfo: GetCheckoutInfoUseCase,
    private readonly submitPayment: SubmitDoctorPaymentUseCase,
    private readonly listPayments: ListDoctorPaymentsUseCase,
  ) {}

  /**
   * GET /api/doctor/subscription-payments/checkout-info?planKey=&period=
   *
   * Returns all information needed to render the checkout modal:
   *   - Plan name and price in USD (server-authoritative)
   *   - Price in Bolívares at current BCV rate
   *   - BCV rate and its date
   *   - Bank catalog for the form selector
   *   - Platform payment instructions
   *
   * planKey/period are validated via CheckoutInfoQuerySchema (period is a closed
   * enum) — an invalid/missing value returns a 400 with a Spanish error message
   * instead of propagating to the plan-price lookup and surfacing a generic 422.
   */
  @Get('checkout-info')
  async checkoutInfo(
    @Query(new ZodValidationPipe(CheckoutInfoQuerySchema)) query: CheckoutInfoQuery,
  ): Promise<SuccessResponse<unknown>> {
    const data = await this.getCheckoutInfo.execute({
      planKey: query.planKey,
      period: query.period,
    });
    return { success: true, data };
  }

  /**
   * POST /api/doctor/subscription-payments
   *
   * Submits a payment comprobante. Body: { planKey, period, bankCode,
   * referenceNumber, receiptPath, notes? }.
   *
   * SECURITY: amountUsd/amountBs/bcvRate are calculated server-side.
   * The client MUST NOT send amounts — they are not in the DTO.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @Body(new ZodValidationPipe(SubmitDoctorPaymentBodySchema))
    body: SubmitDoctorPaymentBody,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const result = await this.submitPayment.execute({
      doctorId: user.sub,
      planKey: body.planKey,
      period: body.period,
      bankCode: body.bankCode,
      referenceNumber: body.referenceNumber,
      receiptPath: body.receiptPath,
      notes: body.notes,
    });
    return { success: true, data: result };
  }

  /**
   * GET /api/doctor/subscription-payments
   *
   * Returns the doctor's own payment history (paginated).
   * receiptUrl is excluded — never expose raw GCS paths to clients.
   */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<PaginatedResponse<unknown>> {
    const result = await this.listPayments.execute({
      doctorId: user.sub,
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(50, Math.max(1, parseInt(limit, 10) || 20)),
    });

    return {
      success: true,
      data: result.items.map(toDoctorPaymentOutput),
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }
}
