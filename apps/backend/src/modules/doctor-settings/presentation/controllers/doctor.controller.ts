import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  UpdateDoctorProfileDtoSchema,
  type UpdateDoctorProfileDto,
  UpdateDoctorScheduleDtoSchema,
  type UpdateDoctorScheduleDto,
  CreatePricingPlanDtoSchema,
  type CreatePricingPlanDto,
  UpdatePricingPlanDtoSchema,
  type UpdatePricingPlanDto,
  UpdateDoctorExchangeRateDtoSchema,
  type UpdateDoctorExchangeRateDto,
} from '@delta/shared-types';

import { GetDoctorProfileUseCase } from '../../application/use-cases/doctor-settings/get-doctor-profile.use-case';
import { UpdateDoctorProfileUseCase } from '../../application/use-cases/doctor-settings/update-doctor-profile.use-case';
import { GetDoctorScheduleUseCase } from '../../application/use-cases/doctor-settings/get-doctor-schedule.use-case';
import { UpdateDoctorScheduleUseCase } from '../../application/use-cases/doctor-settings/update-doctor-schedule.use-case';
import { GetDoctorFeaturesUseCase } from '../../application/use-cases/doctor-settings/get-doctor-features.use-case';
import {
  GetDoctorFeaturesV2UseCase,
  type DoctorFeaturesV2Output,
} from '../../application/use-cases/doctor-settings/get-doctor-features-v2.use-case';
import {
  GetSubscriptionInfoUseCase,
  type SubscriptionInfoOutput,
} from '../../application/use-cases/doctor-settings/get-subscription-info.use-case';
import { GetServicesUseCase } from '../../application/use-cases/doctor-settings/get-services.use-case';
import { CreateServiceUseCase } from '../../application/use-cases/doctor-settings/create-service.use-case';
import { UpdateServiceUseCase } from '../../application/use-cases/doctor-settings/update-service.use-case';
import { DeleteServiceUseCase } from '../../application/use-cases/doctor-settings/delete-service.use-case';
import { GetDoctorExchangeRateUseCase } from '../../application/use-cases/doctor-settings/get-doctor-exchange-rate.use-case';
import { SetDoctorExchangeRateUseCase } from '../../application/use-cases/doctor-settings/set-doctor-exchange-rate.use-case';
import type { DoctorProfile } from '../../domain/entities/doctor-profile.entity';
import type { DoctorScheduleParams } from '../../domain/value-objects/doctor-schedule.vo';
import type { PricingPlan } from '../../../packages/domain/entities/pricing-plan.entity';
import type { DoctorExchangeRateOutput } from '../../application/use-cases/doctor-settings/get-doctor-exchange-rate.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Doctor settings controller — scoped to /api/doctor.
 *
 * SECURITY: doctor_id is ALWAYS taken from the authenticated user (user.sub).
 * Never trust doctor-related IDs from the request body — anti-IDOR.
 *
 * payment_details is only returned in the profile response of the owning doctor.
 * It is NEVER included in public or list responses.
 *
 * DEFERRED (not implemented):
 *   GET /doctor/templates — doctor_templates table does not exist yet (pending PDF generation).
 *   PUT /doctor/templates — same reason; see TODO comment below.
 *
 * All endpoints require DevAuthGuard (Etapa 1 only — never in production).
 */
@Controller('doctor')
@UseGuards(DevAuthGuard)
export class DoctorController {
  constructor(
    private readonly getProfile: GetDoctorProfileUseCase,
    private readonly updateProfile: UpdateDoctorProfileUseCase,
    private readonly getSchedule: GetDoctorScheduleUseCase,
    private readonly updateSchedule: UpdateDoctorScheduleUseCase,
    private readonly getFeatures: GetDoctorFeaturesUseCase,
    private readonly getFeaturesV2: GetDoctorFeaturesV2UseCase,
    private readonly getSubscription: GetSubscriptionInfoUseCase,
    private readonly getServices: GetServicesUseCase,
    private readonly createService: CreateServiceUseCase,
    private readonly updateService: UpdateServiceUseCase,
    private readonly deleteService: DeleteServiceUseCase,
    private readonly getDoctorExchangeRate: GetDoctorExchangeRateUseCase,
    private readonly setDoctorExchangeRate: SetDoctorExchangeRateUseCase,
  ) {}

  /** GET /api/doctor/profile */
  @Get('profile')
  async profile(@CurrentUser() user: CurrentUserPayload): Promise<SuccessResponse<DoctorProfile>> {
    const result = await this.getProfile.execute(user.sub);
    return { success: true, data: result };
  }

  /** PUT /api/doctor/profile */
  @Put('profile')
  async updateProfileHandler(
    @Body(new ZodValidationPipe(UpdateDoctorProfileDtoSchema))
    dto: UpdateDoctorProfileDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<DoctorProfile>> {
    const result = await this.updateProfile.execute(user.sub, {
      specialty: dto.specialty,
      professionalTitle: dto.professional_title,
      paymentMethods: dto.payment_methods,
      paymentDetails: dto.payment_details as Record<string, unknown> | undefined,
      allowsOnline: dto.allows_online,
      officeAddress: dto.office_address,
      city: dto.city,
      avatarUrl: dto.avatar_url,
      logoUrl: dto.logo_url,
      signatureUrl: dto.signature_url,
      licenseNumber: dto.license_number,
      phone: dto.phone,
    });
    return { success: true, data: result };
  }

  /** GET /api/doctor/schedule */
  @Get('schedule')
  async schedule(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<DoctorScheduleParams>> {
    const result = await this.getSchedule.execute(user.sub);
    return { success: true, data: result };
  }

  /** PUT /api/doctor/schedule */
  @Put('schedule')
  async updateScheduleHandler(
    @Body(new ZodValidationPipe(UpdateDoctorScheduleDtoSchema))
    dto: UpdateDoctorScheduleDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<DoctorScheduleParams>> {
    const result = await this.updateSchedule.execute(user.sub, {
      workDays: dto.work_days,
      startTime: dto.start_time,
      endTime: dto.end_time,
      slotDurationMinutes: dto.slot_duration_minutes ?? 30,
      breakStart: dto.break_start ?? null,
      breakEnd: dto.break_end ?? null,
      bookingHorizonWeeks: dto.booking_horizon_weeks ?? 8,
    });
    return { success: true, data: result };
  }

  /**
   * GET /api/doctor/features
   *
   * Returns the effective feature map for the authenticated doctor.
   * Implements lazy-downgrade: if the subscription has expired and the plan
   * is not permanent, the response reflects the permanent fallback plan.
   *
   * Response shape:
   *   {
   *     plan_key: string,         // plan stored on the doctor's subscription
   *     effective_plan_key: string, // plan whose features are served (may differ if downgraded)
   *     is_downgraded: boolean,   // true when the effective plan ≠ stored plan
   *     features: { [featureKey]: boolean }  // feature gate map
   *   }
   */
  @Get('features')
  async features(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<DoctorFeaturesV2Output>> {
    const result = await this.getFeaturesV2.execute(user.sub);
    return { success: true, data: result };
  }

  /** GET /api/doctor/subscription */
  @Get('subscription')
  async subscription(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<SubscriptionInfoOutput>> {
    const result = await this.getSubscription.execute(user.sub);
    return { success: true, data: result };
  }

  /**
   * GET /api/doctor/exchange-rate
   * Returns the doctor's effective exchange rate (custom or global admin rate).
   */
  @Get('exchange-rate')
  async exchangeRate(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<DoctorExchangeRateOutput>> {
    const result = await this.getDoctorExchangeRate.execute(user.sub);
    return { success: true, data: result };
  }

  /**
   * PUT /api/doctor/exchange-rate
   * Updates the doctor's exchange-rate preference (mode + optional custom rate).
   */
  @Put('exchange-rate')
  async updateExchangeRate(
    @Body(new ZodValidationPipe(UpdateDoctorExchangeRateDtoSchema))
    dto: UpdateDoctorExchangeRateDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<DoctorExchangeRateOutput>> {
    if (dto.mode === 'custom' && (dto.custom_rate == null || dto.custom_rate <= 0)) {
      throw new BadRequestException(
        'custom_rate is required and must be > 0 when mode is "custom"',
      );
    }
    const result = await this.setDoctorExchangeRate.execute(user.sub, {
      mode: dto.mode,
      customRate: dto.custom_rate ?? null,
      customRateLabel: dto.custom_rate_label ?? null,
    });
    return { success: true, data: result };
  }

  /**
   * GET /api/doctor/services
   *
   * Returns all pricing plans for the authenticated doctor.
   *
   * Query params:
   *   officeId?: UUID — when provided, returns only plans tied to that office
   *                     PLUS general plans (officeId=null). Validates UUID format.
   *
   * SECURITY: officeId ownership is NOT validated here (read-only; the doctor
   * can query plans by any office UUID). Ownership is only enforced on writes.
   */
  @Get('services')
  async services(
    @CurrentUser() user: CurrentUserPayload,
    @Query('officeId') officeId?: string,
  ): Promise<SuccessResponse<PricingPlan[]>> {
    // Validate UUID format when officeId query param is provided
    if (officeId !== undefined && officeId !== '') {
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(officeId)) {
        throw new BadRequestException('officeId must be a valid UUID');
      }
    }

    const result = await this.getServices.execute(user.sub, {
      officeId: officeId !== undefined && officeId !== '' ? officeId : undefined,
    });
    return { success: true, data: result };
  }

  /** POST /api/doctor/services */
  @Post('services')
  async createServiceHandler(
    @Body(new ZodValidationPipe(CreatePricingPlanDtoSchema))
    dto: CreatePricingPlanDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<PricingPlan>> {
    const result = await this.createService.execute(user.sub, {
      name: dto.name,
      priceUsd: dto.price_usd,
      durationMinutes: dto.duration_minutes,
      sessionsCount: dto.sessions_count,
      description: dto.description ?? null,
      type: dto.type,
      showInBooking: dto.show_in_booking,
      officeId: dto.office_id ?? null,
    });
    return { success: true, data: result };
  }

  /** PUT /api/doctor/services/:id */
  @Put('services/:id')
  async updateServiceHandler(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePricingPlanDtoSchema))
    dto: UpdatePricingPlanDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<PricingPlan>> {
    const result = await this.updateService.execute(user.sub, id, {
      name: dto.name,
      priceUsd: dto.price_usd,
      durationMinutes: dto.duration_minutes,
      sessionsCount: dto.sessions_count,
      description: dto.description,
      type: dto.type,
      showInBooking: dto.show_in_booking,
      isActive: dto.is_active,
      // Pass office_id only when the caller explicitly includes it in the body.
      // This allows setting to null (general plan) or a specific UUID.
      ...('office_id' in dto && { officeId: dto.office_id ?? null }),
    });
    return { success: true, data: result };
  }

  /** DELETE /api/doctor/services/:id */
  @Delete('services/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteServiceHandler(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.deleteService.execute(user.sub, id);
  }

  // TODO: GET /doctor/templates — deferred until doctor_templates table is created
  //       and PDF generation logic is implemented (see migracion/modulos/09-doctor-settings.md).
  // TODO: PUT /doctor/templates — same reason.
}
