import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { GetSellerCommissionsUseCase } from '../../application/use-cases/get-seller-commissions.use-case';
import { GetPendingCommissionsBySellerUseCase } from '../../application/use-cases/get-pending-commissions-by-seller.use-case';
import { RegisterSellerPaymentUseCase } from '../../application/use-cases/register-seller-payment.use-case';
import { GetSellerPaymentsUseCase } from '../../application/use-cases/get-seller-payments.use-case';
import { AssignSpecialistToSellerUseCase } from '../../application/use-cases/assign-specialist-to-seller.use-case';
import { GetAdminSellerPaymentReceiptUrlUseCase } from '../../application/use-cases/get-admin-seller-payment-receipt-url.use-case';
import { GetSellerPaymentReceiptUrlUseCase } from '../../application/use-cases/get-seller-payment-receipt-url.use-case';
import type {
  CommissionRow,
  PendingBySeller,
} from '../../domain/repositories/seller-commission.repository';
import type { SellerPayment } from '../../domain/entities/seller-payment.entity';

// ---------------------------------------------------------------------------
// Request body schemas
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/seller-commissions/payments
 *
 * Registers a cash-out for a set of pending commissions. The amount is
 * calculated server-side from the validated commissions (never from the client).
 */
const RegisterPaymentBodySchema = z
  .object({
    seller_id: z.string().uuid('seller_id must be a UUID'),
    // El techo evita que un lote enorme arme un IN (...) gigante contra la BD.
    // 500 está muy por encima de cualquier pago real a un vendedor.
    commission_ids: z
      .array(z.string().uuid())
      .min(1, 'Seleccioná al menos una comisión para pagar.')
      .max(500, 'No se pueden pagar más de 500 comisiones en un mismo pago.'),
    method: z.string().min(1).max(200),
    reference: z.string().min(1).max(500),
    receipt_url: z.string().url().nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .strict();

type RegisterPaymentBody = z.infer<typeof RegisterPaymentBodySchema>;

/**
 * POST /api/admin/seller-commissions/assign
 *
 * Re-assigns a specialist to a seller. Admin action; overwrites existing sold_by.
 */
const AssignSpecialistBodySchema = z
  .object({
    specialist_id: z.string().uuid('specialist_id must be a UUID'),
    seller_id: z.string().uuid('seller_id must be a UUID'),
  })
  .strict();

type AssignSpecialistBody = z.infer<typeof AssignSpecialistBodySchema>;

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

interface SuccessResponse<T> {
  success: true;
  data: T;
}

function ok<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}

function toCommissionDto(c: CommissionRow) {
  return {
    id: c.id,
    sellerId: c.sellerId,
    specialistId: c.specialistId,
    specialistName: c.specialistName,
    type: c.type,
    amountUsd: c.amountUsd,
    planKey: c.planKey,
    status: c.status,
    earnedAt: c.earnedAt,
    paymentId: c.paymentId,
    createdAt: c.createdAt,
  };
}

function toPendingBySellerDto(p: PendingBySeller) {
  return {
    sellerId: p.sellerId,
    sellerName: p.sellerName,
    totalPendingUsd: p.totalPendingUsd,
    pendingCount: p.pendingCount,
    commissions: p.commissions.map((c) => ({
      commissionId: c.commissionId,
      specialistId: c.specialistId,
      specialistName: c.specialistName,
      type: c.type,
      amountUsd: c.amountUsd,
      planKey: c.planKey,
      earnedAt: c.earnedAt,
    })),
  };
}

/**
 * Maps a SellerPayment entity to the API response DTO.
 *
 * bcvRate is the BCV rate (Bs per USD) snapshotted when the payment was
 * registered. Null for payments created before this field was introduced or
 * when the rate was unavailable at registration time.
 */
function toPaymentDto(p: SellerPayment) {
  return {
    id: p.id,
    sellerId: p.sellerId,
    amountUsd: p.amountUsd,
    /** BCV rate at registration time. Null → show only USD, no Bs equivalent. */
    bcvRate: p.bcvRate,
    method: p.method,
    reference: p.reference,
    receiptUrl: p.receiptUrl,
    notes: p.notes,
    paidAt: p.paidAt,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

/**
 * SellerCommissionsAdminController
 *
 * Admin-only endpoints (role = super_admin):
 *
 *   GET  /api/admin/seller-commissions/pending
 *     → { bcvRate, sellers: pending commissions grouped by seller }.
 *       bcvRate is the current BCV rate for client-side bolivar conversion.
 *       null → BCV rate unavailable; show only USD amounts.
 *
 *   POST /api/admin/seller-commissions/payments
 *     → register a payment batch for a seller's pending commissions.
 *
 *   GET  /api/admin/seller-commissions/payments/:sellerId
 *     → payment history for a specific seller (each payment includes bcvRate).
 *
 *   POST /api/admin/seller-commissions/assign
 *     → assign or re-assign a specialist to a seller.
 *
 * SECURITY:
 *   - All endpoints require @Roles('super_admin').
 *   - adminId always comes from CurrentUser().sub — never from the request body.
 */
@Controller('admin/seller-commissions')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin')
export class SellerCommissionsAdminController {
  constructor(
    private readonly getPending: GetPendingCommissionsBySellerUseCase,
    private readonly registerPayment: RegisterSellerPaymentUseCase,
    private readonly getPayments: GetSellerPaymentsUseCase,
    private readonly assignSpecialist: AssignSpecialistToSellerUseCase,
    private readonly getAdminReceiptUrl: GetAdminSellerPaymentReceiptUrlUseCase,
  ) {}

  /**
   * GET /api/admin/seller-commissions/pending
   *
   * Lists all pending commissions grouped by seller for the admin payout screen.
   *
   * Response shape (breaking change from the previous array):
   *   {
   *     success: true,
   *     data: {
   *       bcvRate: number | null,   // current BCV rate; null → rate unavailable
   *       sellers: [...]            // previously the bare array
   *     }
   *   }
   *
   * The frontend must read data.sellers (not data directly) after this change.
   */
  @Get('pending')
  async listPending(): Promise<
    SuccessResponse<{
      bcvRate: number | null;
      sellers: ReturnType<typeof toPendingBySellerDto>[];
    }>
  > {
    const result = await this.getPending.execute();
    return ok({
      bcvRate: result.bcvRate,
      sellers: result.sellers.map(toPendingBySellerDto),
    });
  }

  /**
   * POST /api/admin/seller-commissions/payments
   * Registers a payment batch. Amount is calculated server-side.
   */
  @Post('payments')
  async registerPaymentEndpoint(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(RegisterPaymentBodySchema)) body: RegisterPaymentBody,
  ): Promise<SuccessResponse<ReturnType<typeof toPaymentDto>>> {
    const payment = await this.registerPayment.execute(
      {
        sellerId: body.seller_id,
        commissionIds: body.commission_ids,
        method: body.method,
        reference: body.reference,
        receiptUrl: body.receipt_url ?? null,
        notes: body.notes ?? null,
      },
      user.sub,
    );
    return ok(toPaymentDto(payment));
  }

  /**
   * GET /api/admin/seller-commissions/payments/:sellerId
   * Payment history for a specific seller.
   * Each payment includes bcvRate (the historical rate at registration time).
   */
  @Get('payments/:sellerId')
  async listPayments(
    @Param('sellerId', ParseUUIDPipe) sellerId: string,
  ): Promise<SuccessResponse<ReturnType<typeof toPaymentDto>[]>> {
    const payments = await this.getPayments.execute(sellerId);
    return ok(payments.map(toPaymentDto));
  }

  /**
   * GET /api/admin/seller-commissions/payments/:paymentId/receipt-url
   *
   * Returns a short-lived signed URL (15 min) for a seller payment comprobante.
   * Never exposes the raw GCS path — only the signed URL is returned.
   *
   * Returns 404 when the payment does not exist or has no comprobante.
   */
  @Get('payments/:paymentId/receipt-url')
  async adminPaymentReceiptUrl(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<SuccessResponse<{ url: string }>> {
    const data = await this.getAdminReceiptUrl.execute(paymentId);
    return ok(data);
  }

  /**
   * POST /api/admin/seller-commissions/assign
   * Assigns or re-assigns a specialist to a seller.
   */
  @Post('assign')
  async assignSpecialistEndpoint(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(AssignSpecialistBodySchema)) body: AssignSpecialistBody,
  ): Promise<SuccessResponse<{ assigned: true }>> {
    await this.assignSpecialist.execute(
      {
        specialistId: body.specialist_id,
        newSellerId: body.seller_id,
      },
      user.sub,
    );
    return ok({ assigned: true });
  }
}

/**
 * SellerCommissionsSellerController
 *
 * Seller portal endpoints (role = seller):
 *
 *   GET /api/seller/commissions
 *     → { bcvRate, commissions: [...] }
 *       bcvRate is the current BCV rate for client-side bolivar conversion.
 *       null → BCV rate unavailable; show only USD amounts.
 *
 *   GET /api/seller/payments
 *     → payment history (each payment includes bcvRate at registration time).
 *
 * SECURITY:
 *   - sellerId always comes from CurrentUser().sub — never from the request body or URL.
 */
@Controller('seller')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('seller')
export class SellerCommissionsSellerController {
  constructor(
    private readonly getCommissions: GetSellerCommissionsUseCase,
    private readonly getPayments: GetSellerPaymentsUseCase,
    private readonly getSellerReceiptUrl: GetSellerPaymentReceiptUrlUseCase,
  ) {}

  /**
   * GET /api/seller/commissions
   *
   * All commissions for the authenticated seller (paid and pending).
   *
   * Response shape (breaking change from the previous array):
   *   {
   *     success: true,
   *     data: {
   *       bcvRate: number | null,   // current BCV rate; null → rate unavailable
   *       commissions: [...]        // previously the bare array
   *     }
   *   }
   *
   * The frontend must read data.commissions (not data directly) after this change.
   */
  @Get('commissions')
  async listMyCommissions(@CurrentUser() user: CurrentUserPayload): Promise<
    SuccessResponse<{
      bcvRate: number | null;
      commissions: ReturnType<typeof toCommissionDto>[];
    }>
  > {
    const result = await this.getCommissions.execute(user.sub);
    return ok({
      bcvRate: result.bcvRate,
      commissions: result.commissions.map(toCommissionDto),
    });
  }

  /**
   * GET /api/seller/payments
   * Payment history for the authenticated seller.
   * Each payment includes bcvRate (the historical rate at registration time).
   */
  @Get('payments')
  async listMyPayments(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ReturnType<typeof toPaymentDto>[]>> {
    const payments = await this.getPayments.execute(user.sub);
    return ok(payments.map(toPaymentDto));
  }

  /**
   * GET /api/seller/payments/:paymentId/receipt-url
   *
   * Returns a short-lived signed URL (15 min) for a specific payment comprobante.
   *
   * SECURITY:
   *   - sellerId comes from CurrentUser().sub — never from the URL.
   *   - If the payment does not exist OR belongs to a different seller, the same
   *     404 is returned (anti-IDOR: sellers cannot enumerate other sellers' payments).
   *   - Returns 404 when the payment has no comprobante attached.
   */
  @Get('payments/:paymentId/receipt-url')
  async myPaymentReceiptUrl(
    @CurrentUser() user: CurrentUserPayload,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<SuccessResponse<{ url: string }>> {
    const data = await this.getSellerReceiptUrl.execute(paymentId, user.sub);
    return ok(data);
  }
}
