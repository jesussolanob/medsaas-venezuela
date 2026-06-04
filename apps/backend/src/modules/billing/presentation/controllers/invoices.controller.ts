import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CreateInvoiceBodySchema,
  type CreateInvoiceBody,
} from '../../application/dtos/billing.dtos';
import { CreateInvoiceUseCase } from '../../application/use-cases/billing/create-invoice.use-case';
import { ListInvoicesUseCase } from '../../application/use-cases/billing/list-invoices.use-case';
import { MarkInvoicePaidUseCase } from '../../application/use-cases/billing/mark-invoice-paid.use-case';
import type { InvoiceProps } from '../../domain/entities/invoice.entity';

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
 * Admin controller for invoice management.
 *
 * All endpoints require DevAuthGuard + RolesGuard with 'super_admin'.
 * Replaces: apps/frontend/app/api/admin/invoices/route.ts
 *           apps/frontend/app/api/admin/mark-invoice-paid/route.ts
 */
@Controller('admin/invoices')
@UseGuards(DevAuthGuard, RolesGuard)
@Roles('super_admin')
export class InvoicesController {
  constructor(
    private readonly createInvoice: CreateInvoiceUseCase,
    private readonly listInvoices: ListInvoicesUseCase,
    private readonly markPaid: MarkInvoicePaidUseCase,
  ) {}

  /**
   * POST /api/admin/invoices
   * Body: { doctor_id, amount, currency?, description? }
   */
  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(CreateInvoiceBodySchema)) body: CreateInvoiceBody,
  ): Promise<SuccessResponse<unknown>> {
    const invoice = await this.createInvoice.execute({
      doctorId: body.doctor_id,
      amount: body.amount,
      currency: body.currency,
      description: body.description ?? null,
      createdBy: user.sub,
    });
    return { success: true, data: this.toOutput(invoice.toPlain()) };
  }

  /**
   * GET /api/admin/invoices
   */
  @Get()
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<PaginatedResponse<unknown>> {
    const result = await this.listInvoices.execute({
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });

    return {
      success: true,
      data: result.items.map((i) => this.toOutput(i.toPlain())),
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /**
   * PUT /api/admin/invoices/:id/paid
   */
  @Put(':id/paid')
  async markInvoicePaid(@Param('id') id: string): Promise<SuccessResponse<unknown>> {
    const invoice = await this.markPaid.execute({ invoiceId: id });
    return { success: true, data: this.toOutput(invoice.toPlain()) };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toOutput(props: InvoiceProps): unknown {
    return {
      id: props.id,
      doctorId: props.doctorId,
      invoiceNumber: props.invoiceNumber,
      amount: props.amount,
      currency: props.currency,
      description: props.description,
      status: props.status,
      issuedAt: props.issuedAt,
      paidAt: props.paidAt,
      createdBy: props.createdBy,
      createdAt: props.createdAt,
    };
  }
}
