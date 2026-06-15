import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
  UpdatePaymentStatusDtoSchema,
  type UpdatePaymentStatusDto,
  AddPaymentItemDtoSchema,
  type AddPaymentItemDto,
  AttachPaymentReceiptDtoSchema,
  type AttachPaymentReceiptDto,
} from '@delta/shared-types';

import { ListPaymentsUseCase } from '../../application/use-cases/payments/list-payments.use-case';
import { GetPaymentTotalsUseCase } from '../../application/use-cases/payments/get-payment-totals.use-case';
import { UpdatePaymentStatusUseCase } from '../../application/use-cases/payments/update-payment-status.use-case';
import { AddPaymentItemUseCase } from '../../application/use-cases/payments/add-payment-item.use-case';
import { RemovePaymentItemUseCase } from '../../application/use-cases/payments/remove-payment-item.use-case';
import { ListPaymentItemsUseCase } from '../../application/use-cases/payments/list-payment-items.use-case';
import { AttachPaymentReceiptUseCase } from '../../application/use-cases/payments/attach-payment-receipt.use-case';
import type {
  PaymentWithRelations,
  PaymentTotals,
} from '../../domain/repositories/payment.repository';
import type { Payment } from '../../domain/entities/payment.entity';
import type { PaymentItem } from '../../domain/entities/payment-item.entity';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/** Safe payment output — never exposes patients.* PII (only snapshots from appointments) */
interface PaymentOutput {
  id: string;
  payment_code: string | null;
  amount_usd: number;
  amount_bs: number | null;
  status: string;
  paid_at: string | null;
  method_snapshot: string | null;
  created_at: string;
  appointment: {
    id: string;
    appointment_code: string | null;
    scheduled_at: string;
    patient_name: string | null;
    plan_name: string | null;
    payment_receipt_url: string | null;
    consultation_id: string | null;
  } | null;
  consultation: {
    consultation_code: string | null;
  } | null;
}

interface PaymentStatusOutput {
  id: string;
  status: string;
  paid_at: string | null;
}

interface PaymentItemOutput {
  id: string;
  payment_id: string;
  name: string;
  amount_usd: number;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
}

/**
 * Maps a PaymentWithRelations to a safe API output.
 * SECURITY: Only exposes patient_name snapshot from appointments table,
 *           never touches patients.* encrypted columns.
 */
function toPaymentOutput(p: PaymentWithRelations): PaymentOutput {
  return {
    id: p.id,
    payment_code: p.paymentCode,
    amount_usd: p.amountUsd,
    amount_bs: p.amountBs,
    status: p.status,
    paid_at: p.paidAt ? p.paidAt.toISOString() : null,
    method_snapshot: p.methodSnapshot,
    created_at: p.createdAt.toISOString(),
    appointment: p.appointment
      ? {
          id: p.appointment.id,
          appointment_code: p.appointment.appointmentCode,
          scheduled_at: p.appointment.scheduledAt.toISOString(),
          patient_name: p.appointment.patientName,
          plan_name: p.appointment.planName,
          payment_receipt_url: p.appointment.paymentReceiptUrl,
          consultation_id: p.appointment.consultationId,
        }
      : null,
    consultation: p.consultation ? { consultation_code: p.consultation.consultationCode } : null,
  };
}

function toStatusOutput(p: Payment): PaymentStatusOutput {
  return {
    id: p.id,
    status: p.status,
    paid_at: p.paidAt ? p.paidAt.toISOString() : null,
  };
}

function toItemOutput(item: PaymentItem): PaymentItemOutput {
  return {
    id: item.id,
    payment_id: item.paymentId,
    name: item.name,
    amount_usd: item.amountUsd,
    source_type: item.sourceType,
    source_id: item.sourceId,
    created_at: item.createdAt.toISOString(),
  };
}

/**
 * PaymentsController — scoped to /api/finances/payments
 *
 * SECURITY:
 *   - doctorId is ALWAYS taken from the authenticated user (anti-IDOR).
 *   - Never trust doctor_id from query params or body.
 *   - No PII from patients table is ever returned — only snapshots.
 *   - All endpoints guarded by DevAuthGuard (Etapa 1).
 */
@Controller('finances/payments')
@UseGuards(AppAuthGuard)
export class PaymentsController {
  constructor(
    private readonly listPayments: ListPaymentsUseCase,
    private readonly getPaymentTotals: GetPaymentTotalsUseCase,
    private readonly updatePaymentStatus: UpdatePaymentStatusUseCase,
    private readonly addPaymentItem: AddPaymentItemUseCase,
    private readonly removePaymentItem: RemovePaymentItemUseCase,
    private readonly listPaymentItems: ListPaymentItemsUseCase,
    private readonly attachReceipt: AttachPaymentReceiptUseCase,
  ) {}

  /**
   * GET /api/finances/payments?status=&from_date=&to_date=
   * Lists all payments for the authenticated doctor with appointment + consultation joins.
   */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status?: string,
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
  ): Promise<SuccessResponse<PaymentOutput[]>> {
    const validStatus =
      status === 'pending' || status === 'approved' || status === 'all' ? status : undefined;

    const rows = await this.listPayments.execute({
      doctorId: user.sub,
      status: validStatus,
      fromDate,
      toDate,
    });

    return { success: true, data: rows.map(toPaymentOutput) };
  }

  /**
   * GET /api/finances/payments/totals?from_date=&to_date=
   * Returns aggregate totals (approved/pending USD + counts).
   */
  @Get('totals')
  async totals(
    @CurrentUser() user: CurrentUserPayload,
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
  ): Promise<SuccessResponse<PaymentTotals>> {
    const result = await this.getPaymentTotals.execute({
      doctorId: user.sub,
      fromDate,
      toDate,
    });
    return { success: true, data: result };
  }

  /**
   * PUT /api/finances/payments/:id/status
   * Updates the status of a payment (pending ↔ approved).
   * Also syncs consultations.payment_status via the appointment link.
   */
  @Put(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(UpdatePaymentStatusDtoSchema)) dto: UpdatePaymentStatusDto,
  ): Promise<SuccessResponse<PaymentStatusOutput>> {
    const payment = await this.updatePaymentStatus.execute({
      paymentId: id,
      doctorId: user.sub,
      status: dto.status,
    });
    return { success: true, data: toStatusOutput(payment) };
  }

  /**
   * PATCH /api/finances/payments/:id/receipt
   * Attaches a payment receipt URL to a payment.
   * The client uploads the file to storage first, then calls this endpoint with the URL.
   *
   * SECURITY:
   *   - doctorId is from the authenticated user — anti-IDOR.
   *   - 404 when the payment does not exist.
   *   - 403 when the payment belongs to another doctor.
   */
  @Patch(':id/receipt')
  async attachReceiptHandler(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(AttachPaymentReceiptDtoSchema)) dto: AttachPaymentReceiptDto,
  ): Promise<SuccessResponse<{ id: string; payment_receipt_url: string }>> {
    const payment = await this.attachReceipt.execute({
      paymentId: id,
      doctorId: user.sub,
      receiptUrl: dto.receipt_url,
    });
    return {
      success: true,
      data: { id: payment.id, payment_receipt_url: payment.paymentReceiptUrl ?? '' },
    };
  }

  /**
   * GET /api/finances/payments/:id/items
   * Lists all line items for a payment.
   */
  @Get(':id/items')
  async listItems(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<PaymentItemOutput[]>> {
    const items = await this.listPaymentItems.execute({
      paymentId: id,
      doctorId: user.sub,
    });
    return { success: true, data: items.map(toItemOutput) };
  }

  /**
   * POST /api/finances/payments/:id/items
   * Adds a line item to a payment and recalculates the total.
   */
  @Post(':id/items')
  async addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(AddPaymentItemDtoSchema)) dto: AddPaymentItemDto,
  ): Promise<SuccessResponse<PaymentItemOutput>> {
    const item = await this.addPaymentItem.execute({
      paymentId: id,
      doctorId: user.sub,
      name: dto.name,
      amountUsd: dto.amount_usd,
      sourceType: dto.source_type ?? null,
      sourceId: dto.source_id ?? null,
    });
    return { success: true, data: toItemOutput(item) };
  }

  /**
   * DELETE /api/finances/payments/:id/items/:itemId
   * Removes a line item from a payment and recalculates the total.
   */
  @Delete(':id/items/:itemId')
  async removeItem(
    @Param('id', ParseUUIDPipe) _paymentId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<{ removed: true }>> {
    await this.removePaymentItem.execute({
      itemId,
      doctorId: user.sub,
    });
    return { success: true, data: { removed: true } };
  }
}
