import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
  CreateConsultationBodyDtoSchema,
  UpdateConsultationDtoSchema,
  ApprovePaymentDtoSchema,
  ApprovePaymentWithExtrasDtoSchema,
  UpdatePaymentDetailsDtoSchema,
  type CreateConsultationBodyDto,
  type UpdateConsultationDto,
  type ApprovePaymentDto,
  type ApprovePaymentWithExtrasDto,
  type UpdatePaymentDetailsDto,
  type PaymentStatus,
} from '@delta/shared-types';
import type { ConsultationSortField } from '../../domain/repositories/consultation.repository';

import { CreateConsultationUseCase } from '../../application/use-cases/consultations/create-consultation.use-case';
import { UpdateConsultationUseCase } from '../../application/use-cases/consultations/update-consultation.use-case';
import { ApprovePaymentUseCase } from '../../application/use-cases/consultations/approve-payment.use-case';
import { ApprovePaymentWithExtrasUseCase } from '../../application/use-cases/consultations/approve-payment-with-extras.use-case';
import { UpdatePaymentDetailsUseCase } from '../../application/use-cases/consultations/update-payment-details.use-case';
import { GetConsultationByIdUseCase } from '../../application/use-cases/consultations/get-consultation-by-id.use-case';
import { GetPatientConsultationHistoryUseCase } from '../../application/use-cases/consultations/get-patient-consultation-history.use-case';
import { ListConsultationsUseCase } from '../../application/use-cases/consultations/list-consultations.use-case';
import { ListConsultationsWithPatientUseCase } from '../../application/use-cases/consultations/list-consultations-with-patient.use-case';
import { toConsultationResponse, toConsultationListItem } from '../mappers/consultation.mapper';

/**
 * Validates that an optional query param is a parseable ISO date string.
 * Returns undefined when the value is absent; throws BadRequestException for
 * non-empty strings that cannot be parsed as a valid date.
 */
function parseOptionalIsoDate(value: string | undefined, param: string): string | undefined {
  if (!value) return undefined;
  const ts = Date.parse(value);
  if (isNaN(ts)) {
    throw new BadRequestException(`Query parameter "${param}" must be a valid ISO date string`);
  }
  return value;
}

const PAYMENT_STATUS_VALUES: readonly PaymentStatus[] = ['pending', 'approved'];

/**
 * Validates the optional payment_status query param against the allowed enum.
 * Returns undefined when absent; throws BadRequestException for invalid values.
 */
function parseOptionalPaymentStatus(value: string | undefined): PaymentStatus | undefined {
  if (!value) return undefined;
  if (!PAYMENT_STATUS_VALUES.includes(value as PaymentStatus)) {
    throw new BadRequestException(
      `Query parameter "payment_status" must be one of: ${PAYMENT_STATUS_VALUES.join(', ')}`,
    );
  }
  return value as PaymentStatus;
}

const SORT_VALUES: readonly ConsultationSortField[] = [
  'consultation_date',
  'created_at',
  'consultation_status',
  'confirmation_status',
];

/**
 * Validates the optional `sort` query param against the whitelisted set.
 * Returns undefined (falls back to default in the repo) for absent or invalid values.
 * Invalid values are silently ignored — no exception is thrown — to keep the API
 * lenient for future clients that may send an older sort key.
 */
function parseOptionalSort(value: string | undefined): ConsultationSortField | undefined {
  if (!value) return undefined;
  if (SORT_VALUES.includes(value as ConsultationSortField)) {
    return value as ConsultationSortField;
  }
  return undefined;
}

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
 * Consultations controller.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * All endpoints require AppAuthGuard.
 *
 * SECURITY: doctor_id is ALWAYS taken from the authenticated user (user.sub).
 * Never trust doctor_id from the request body — anti-IDOR.
 */
@Controller('consultations')
@UseGuards(AppAuthGuard)
export class ConsultationsController {
  constructor(
    private readonly createConsultation: CreateConsultationUseCase,
    private readonly updateConsultation: UpdateConsultationUseCase,
    private readonly approvePayment: ApprovePaymentUseCase,
    private readonly approvePaymentWithExtras: ApprovePaymentWithExtrasUseCase,
    private readonly updatePaymentDetailsUseCase: UpdatePaymentDetailsUseCase,
    private readonly getById: GetConsultationByIdUseCase,
    private readonly getHistory: GetPatientConsultationHistoryUseCase,
    private readonly listConsultations: ListConsultationsUseCase,
    private readonly listConsultationsWithPatient: ListConsultationsWithPatientUseCase,
  ) {}

  /**
   * GET /api/consultations/with-patient — the doctor's consultations enriched with
   * the patient's decrypted name/phone/email (for billing receipts/estimates).
   *
   * Declared BEFORE @Get(':id') so the static path is not captured by the param route.
   * Anti-IDOR: doctorId comes from user.sub; patients are scoped to the same doctor.
   */
  @Get('with-patient')
  async listWithPatient(
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limit = '100',
  ): Promise<SuccessResponse<unknown[]>> {
    const items = await this.listConsultationsWithPatient.execute({
      doctorId: user.sub,
      limit: Math.min(200, Math.max(1, parseInt(limit, 10) || 100)),
    });
    return { success: true, data: items };
  }

  /** GET /api/consultations — paginated list with optional filters and sort. */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('payment_status') paymentStatus?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('sort') sort?: string,
  ): Promise<PaginatedResponse<unknown>> {
    const result = await this.listConsultations.execute({
      doctorId: user.sub,
      dateFrom: parseOptionalIsoDate(dateFrom, 'date_from'),
      dateTo: parseOptionalIsoDate(dateTo, 'date_to'),
      paymentStatus: parseOptionalPaymentStatus(paymentStatus),
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
      sort: parseOptionalSort(sort),
    });

    return {
      success: true,
      data: result.items.map(toConsultationListItem),
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /** GET /api/consultations/patient/:patientId — consultation history for a patient. */
  @Get('patient/:patientId')
  async getPatientHistory(
    @Param('patientId') patientId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<PaginatedResponse<unknown>> {
    const result = await this.getHistory.execute({
      patientId,
      doctorId: user.sub,
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });

    return {
      success: true,
      data: result.items.map(toConsultationListItem),
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /** GET /api/consultations/:id — single consultation detail. */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const consultation = await this.getById.execute({
      consultationId: id,
      doctorId: user.sub,
    });
    return { success: true, data: toConsultationResponse(consultation) };
  }

  /**
   * POST /api/consultations — create a new consultation.
   *
   * doctor_id is taken from the authenticated user — the body's doctor_id is
   * ignored to prevent IDOR.
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateConsultationBodyDtoSchema)) dto: CreateConsultationBodyDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const consultation = await this.createConsultation.execute({
      doctorId: user.sub,
      patientId: dto.patient_id,
      appointmentId: dto.appointment_id ?? null,
      consultationDate: new Date(dto.consultation_date),
      chiefComplaint: dto.chief_complaint ?? null,
      notes: dto.notes ?? null,
    });
    return { success: true, data: toConsultationResponse(consultation) };
  }

  /** PUT /api/consultations/:id — update clinical fields (partial). */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateConsultationDtoSchema)) dto: UpdateConsultationDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const consultation = await this.updateConsultation.execute({
      consultationId: id,
      doctorId: user.sub,
      chiefComplaint: dto.chief_complaint,
      diagnosis: dto.diagnosis,
      treatment: dto.treatment,
      notes: dto.notes,
      blocksSnapshot: dto.blocks_snapshot,
    });
    return { success: true, data: toConsultationResponse(consultation) };
  }

  /**
   * PUT /api/consultations/:id/payment — approve payment (pending → approved).
   *
   * Returns PaymentAlreadyApprovedError if already approved.
   */
  @Put(':id/payment')
  async approvePaymentEndpoint(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ApprovePaymentDtoSchema)) dto: ApprovePaymentDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const consultation = await this.approvePayment.execute({
      consultationId: id,
      doctorId: user.sub,
      amount: dto.amount,
      paymentMethod: dto.payment_method,
      paymentDate: dto.payment_date ? new Date(dto.payment_date) : null,
    });
    return { success: true, data: toConsultationResponse(consultation) };
  }

  /**
   * PATCH /api/consultations/:id/approve-payment — approve payment with extra items.
   *
   * Replaces the extras list atomically and sets payment_status = 'approved'.
   * Can be called multiple times to edit the extras (re-approval is idempotent
   * with respect to the base price — base_amount is fixed on the first call).
   *
   * Body: { extras: [{ description, amount_usd }], method?: string }
   *
   * Total = base_amount + Σ(extras[].amount_usd) is persisted to consultations.amount
   * so the finance module (COALESCE(c.amount, a.plan_price, 0)) picks it up automatically.
   *
   * SECURITY: doctorId comes from user.sub (never from the body — anti-IDOR).
   */
  @Patch(':id/approve-payment')
  async approvePaymentWithExtrasEndpoint(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ApprovePaymentWithExtrasDtoSchema))
    dto: ApprovePaymentWithExtrasDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const consultation = await this.approvePaymentWithExtras.execute({
      consultationId: id,
      doctorId: user.sub,
      extras: dto.extras.map((e) => ({ description: e.description, amountUsd: e.amount_usd })),
      paymentMethod: dto.method ?? null,
    });
    return { success: true, data: toConsultationResponse(consultation) };
  }

  /**
   * PATCH /api/consultations/:id/payment-details — edit payment details.
   *
   * Editable at any time, including when the payment is already approved.
   * All fields are optional; only provided fields are updated.
   *
   * SECURITY: doctorId comes from user.sub (authenticated token) — never from the body.
   */
  @Patch(':id/payment-details')
  async updatePaymentDetailsEndpoint(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePaymentDetailsDtoSchema)) dto: UpdatePaymentDetailsDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const consultation = await this.updatePaymentDetailsUseCase.execute({
      consultationId: id,
      doctorId: user.sub,
      paymentStatus: dto.payment_status,
      paymentMethod: dto.payment_method,
      paymentReference: dto.payment_reference,
      paymentReceiptUrl: dto.payment_receipt_url,
      amount: dto.amount,
    });
    return { success: true, data: toConsultationResponse(consultation) };
  }
}
