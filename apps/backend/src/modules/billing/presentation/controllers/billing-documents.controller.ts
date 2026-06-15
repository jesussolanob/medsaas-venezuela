import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CreateBillingDocumentBodySchema,
  type CreateBillingDocumentBody,
} from '../../application/dtos/billing.dtos';
import { ListBillingDocumentsUseCase } from '../../application/use-cases/billing/list-billing-documents.use-case';
import { CreateBillingDocumentUseCase } from '../../application/use-cases/billing/create-billing-document.use-case';
import type { BillingDocumentProps } from '../../domain/entities/billing-document.entity';

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
 * Doctor controller for billing document management.
 *
 * Anti-IDOR: doctorId is always taken from user.sub (authenticated user),
 * never from request body or params. A doctor can only see their own documents.
 *
 * Replaces: apps/frontend/app/api/doctor/billing/route.ts
 */
@Controller('doctor/billing')
@UseGuards(AppAuthGuard)
export class BillingDocumentsController {
  constructor(
    private readonly listDocuments: ListBillingDocumentsUseCase,
    private readonly createDocument: CreateBillingDocumentUseCase,
  ) {}

  /**
   * GET /api/doctor/billing
   */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<PaginatedResponse<unknown>> {
    const result = await this.listDocuments.execute({
      doctorId: user.sub,
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });

    return {
      success: true,
      data: result.items.map((d) => this.toOutput(d.toPlain())),
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /**
   * POST /api/doctor/billing
   * Body: { doc_type, total, items?, ... }
   */
  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(CreateBillingDocumentBodySchema)) body: CreateBillingDocumentBody,
  ): Promise<SuccessResponse<unknown>> {
    const doc = await this.createDocument.execute({
      docType: body.doc_type,
      // Anti-IDOR: always use authenticated user's id
      doctorId: user.sub,
      consultationId: body.consultation_id ?? null,
      paymentId: body.payment_id ?? null,
      // patientId is stored but NOT used to query patient data from this endpoint.
      // Patient PII must never flow through this response.
      patientId: body.patient_id ?? null,
      items: body.items,
      subtotal: body.subtotal ?? null,
      total: body.total,
      ivaAmount: body.iva_amount,
      igtfAmount: body.igtf_amount,
      bcvRate: body.bcv_rate ?? null,
      totalBs: body.total_bs ?? null,
      notes: body.notes ?? null,
      currency: body.currency,
    });

    return { success: true, data: this.toOutput(doc.toPlain()) };
  }

  // ---------------------------------------------------------------------------
  // Private helpers — never expose patientId or patient PII in responses
  // ---------------------------------------------------------------------------

  private toOutput(props: BillingDocumentProps): unknown {
    return {
      id: props.id,
      docNumber: props.docNumber,
      docType: props.docType,
      // doctorId is always the authenticated user — safe to return
      doctorId: props.doctorId,
      consultationId: props.consultationId,
      paymentId: props.paymentId,
      // patientId is intentionally omitted from the response to avoid PII leakage.
      // The frontend does not need to display it in list/detail views.
      items: props.items,
      subtotal: props.subtotal,
      total: props.total,
      ivaAmount: props.ivaAmount,
      igtfAmount: props.igtfAmount,
      bcvRate: props.bcvRate,
      totalBs: props.totalBs,
      notes: props.notes,
      currency: props.currency,
      status: props.status,
      createdAt: props.createdAt,
    };
  }
}
