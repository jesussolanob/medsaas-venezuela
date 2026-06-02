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
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CreateConsultationBodyDtoSchema,
  UpdateConsultationDtoSchema,
  ApprovePaymentDtoSchema,
  type CreateConsultationBodyDto,
  type UpdateConsultationDto,
  type ApprovePaymentDto,
  type PaymentStatus,
} from '@delta/shared-types';

import { CreateConsultationUseCase } from '../../application/use-cases/consultations/create-consultation.use-case';
import { UpdateConsultationUseCase } from '../../application/use-cases/consultations/update-consultation.use-case';
import { ApprovePaymentUseCase } from '../../application/use-cases/consultations/approve-payment.use-case';
import { GetConsultationByIdUseCase } from '../../application/use-cases/consultations/get-consultation-by-id.use-case';
import { GetPatientConsultationHistoryUseCase } from '../../application/use-cases/consultations/get-patient-consultation-history.use-case';
import { ListConsultationsUseCase } from '../../application/use-cases/consultations/list-consultations.use-case';
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
 * All endpoints require DevAuthGuard (Etapa 1 only).
 *
 * SECURITY: doctor_id is ALWAYS taken from the authenticated user (user.sub).
 * Never trust doctor_id from the request body — anti-IDOR.
 */
@Controller('consultations')
@UseGuards(DevAuthGuard)
export class ConsultationsController {
  constructor(
    private readonly createConsultation: CreateConsultationUseCase,
    private readonly updateConsultation: UpdateConsultationUseCase,
    private readonly approvePayment: ApprovePaymentUseCase,
    private readonly getById: GetConsultationByIdUseCase,
    private readonly getHistory: GetPatientConsultationHistoryUseCase,
    private readonly listConsultations: ListConsultationsUseCase,
  ) {}

  /** GET /api/consultations — paginated list with optional filters. */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('payment_status') paymentStatus?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<PaginatedResponse<unknown>> {
    const result = await this.listConsultations.execute({
      doctorId: user.sub,
      dateFrom: parseOptionalIsoDate(dateFrom, 'date_from'),
      dateTo: parseOptionalIsoDate(dateTo, 'date_to'),
      paymentStatus: parseOptionalPaymentStatus(paymentStatus),
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
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
}
