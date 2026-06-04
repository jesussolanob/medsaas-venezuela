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
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import {
  UpdateSubscriptionBodySchema,
  TogglePlanBodySchema,
  TogglePlanFeatureBodySchema,
  ExtendSubscriptionBodySchema,
  SuspendSubscriptionBodySchema,
  ReactivateSubscriptionBodySchema,
  VALID_ACTIVITY_STATUSES,
  VALID_SUBSCRIPTION_STATUSES,
  VALID_SUBSCRIPTION_PLANS,
  type UpdateSubscriptionBody,
  type TogglePlanBody,
  type TogglePlanFeatureBody,
  type ExtendSubscriptionBody,
  type SuspendSubscriptionBody,
  type ReactivateSubscriptionBody,
} from '../../application/dtos/admin.dtos';
import { GetAdminDashboardUseCase } from '../../application/use-cases/admin/get-admin-dashboard.use-case';
import { GetDoctorsListUseCase } from '../../application/use-cases/admin/get-doctors-list.use-case';
import { GetDoctorDetailUseCase } from '../../application/use-cases/admin/get-doctor-detail.use-case';
import { UpdateDoctorSubscriptionUseCase } from '../../application/use-cases/admin/update-doctor-subscription.use-case';
import { GetSubscriptionsUseCase } from '../../application/use-cases/admin/get-subscriptions.use-case';
import { GetPlansUseCase } from '../../application/use-cases/admin/get-plans.use-case';
import { TogglePlanUseCase } from '../../application/use-cases/admin/toggle-plan.use-case';
import { GetPlanFeaturesUseCase } from '../../application/use-cases/admin/get-plan-features.use-case';
import { TogglePlanFeatureUseCase } from '../../application/use-cases/admin/toggle-plan-feature.use-case';
import { GetPatientsStatsUseCase } from '../../application/use-cases/admin/get-patients-stats.use-case';
import { GetSettingsUseCase } from '../../application/use-cases/admin/get-settings.use-case';
import { ExtendDoctorSubscriptionUseCase } from '../../application/use-cases/admin/extend-doctor-subscription.use-case';
import { SuspendDoctorSubscriptionUseCase } from '../../application/use-cases/admin/suspend-doctor-subscription.use-case';
import { ReactivateDoctorSubscriptionUseCase } from '../../application/use-cases/admin/reactivate-doctor-subscription.use-case';
import type { SubscriptionPlan, SubscriptionStatus } from '@delta/shared-types';
import type { ActivityStatus } from '../../domain/repositories/admin.repository';

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
 * Admin controller — all endpoints require DevAuthGuard (authentication) and
 * RolesGuard with @Roles('super_admin') (authorization).
 *
 * The @Roles('super_admin') and @UseGuards are applied at the class level so
 * every endpoint in this controller is protected — there are no gaps.
 *
 * NOTE: POST /admin/settings/usdt-rate is intentionally absent from this
 * controller — it is already implemented in
 * finances/presentation/controllers/settings.controller.ts (AdminSettingsController).
 * Duplicating it here would create conflicting routes.
 */
@Controller('admin')
@UseGuards(DevAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminController {
  constructor(
    private readonly getDashboard: GetAdminDashboardUseCase,
    private readonly getDoctorsList: GetDoctorsListUseCase,
    private readonly getDoctorDetail: GetDoctorDetailUseCase,
    private readonly updateSubscription: UpdateDoctorSubscriptionUseCase,
    private readonly getSubscriptions: GetSubscriptionsUseCase,
    private readonly getPlans: GetPlansUseCase,
    private readonly togglePlan: TogglePlanUseCase,
    private readonly getPlanFeatures: GetPlanFeaturesUseCase,
    private readonly togglePlanFeature: TogglePlanFeatureUseCase,
    private readonly getPatientsStats: GetPatientsStatsUseCase,
    private readonly getSettings: GetSettingsUseCase,
    private readonly extendSubscriptionOp: ExtendDoctorSubscriptionUseCase,
    private readonly suspendSubscriptionOp: SuspendDoctorSubscriptionUseCase,
    private readonly reactivateSubscriptionOp: ReactivateDoctorSubscriptionUseCase,
  ) {}

  /** GET /api/admin/dashboard — KPIs: doctor counts by activity, appointments, patients, expiring subscriptions */
  @Get('dashboard')
  async dashboard(): Promise<SuccessResponse<unknown>> {
    const data = await this.getDashboard.execute();
    return { success: true, data };
  }

  /**
   * GET /api/admin/doctors — paginated list with optional filters.
   *
   * ?activity_status must be one of: active | cold | inactive — returns 400 if invalid.
   * ?subscription_status must be a valid SubscriptionStatus — returns 400 if invalid.
   *
   * NOTE (Etapa 1 / Fase 4): activityStatus filtering is in-memory because
   * lastSignInAt is not tracked until Auth0 is integrated (Fase 4). In Etapa 1,
   * all doctors have null lastSignInAt → all classify as 'inactive'. The filter
   * parameter is accepted and documented but its in-memory nature means the
   * paginated total reflects the filtered page, not a full cross-page count.
   */
  @Get('doctors')
  async listDoctors(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('activity_status') activityStatusRaw?: string,
    @Query('subscription_status') subscriptionStatusRaw?: string,
  ): Promise<PaginatedResponse<unknown>> {
    // Reject unknown enum values explicitly (400) — do not silently ignore them
    if (
      activityStatusRaw !== undefined &&
      !(VALID_ACTIVITY_STATUSES as readonly string[]).includes(activityStatusRaw)
    ) {
      throw new BadRequestException(
        `Invalid activity_status '${activityStatusRaw}'. Must be one of: ${VALID_ACTIVITY_STATUSES.join(', ')}`,
      );
    }
    if (
      subscriptionStatusRaw !== undefined &&
      !(VALID_SUBSCRIPTION_STATUSES as readonly string[]).includes(subscriptionStatusRaw)
    ) {
      throw new BadRequestException(
        `Invalid subscription_status '${subscriptionStatusRaw}'. Must be one of: ${VALID_SUBSCRIPTION_STATUSES.join(', ')}`,
      );
    }

    const activityStatus = activityStatusRaw as ActivityStatus | undefined;
    const subscriptionStatus = subscriptionStatusRaw as SubscriptionStatus | undefined;

    const result = await this.getDoctorsList.execute({
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
      activityStatus,
      subscriptionStatus,
    });

    return {
      success: true,
      data: result.items.map((d) => ({
        id: d.id,
        fullName: d.fullName,
        email: d.email,
        specialty: d.specialty,
        subscriptionStatus: d.subscriptionStatus,
        subscriptionPlan: d.subscriptionPlan,
        subscriptionExpiresAt: d.subscriptionExpiresAt,
        activityStatus: d.activityStatus,
      })),
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /** GET /api/admin/doctors/:id — detail for a single doctor */
  @Get('doctors/:id')
  async getDoctorById(@Param('id') id: string): Promise<SuccessResponse<unknown>> {
    const doctor = await this.getDoctorDetail.execute({ doctorId: id });
    return {
      success: true,
      data: {
        id: doctor.id,
        fullName: doctor.fullName,
        email: doctor.email,
        specialty: doctor.specialty,
        subscriptionStatus: doctor.subscriptionStatus,
        subscriptionPlan: doctor.subscriptionPlan,
        subscriptionExpiresAt: doctor.subscriptionExpiresAt,
        activityStatus: doctor.activityStatus,
        lastSignInAt: doctor.lastSignInAt,
      },
    };
  }

  /**
   * PUT /api/admin/doctors/:id/subscription — manually update a doctor's subscription.
   *
   * Body is validated by UpdateSubscriptionBodySchema:
   *   - plan: valid SubscriptionPlan enum value
   *   - status: valid SubscriptionStatus enum value
   *   - expires_at: ISO 8601 datetime string (prevents Invalid Date in DB)
   *   - notes: optional string ≤ 1000 chars
   */
  @Put('doctors/:id/subscription')
  async updateDoctorSubscription(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSubscriptionBodySchema)) body: UpdateSubscriptionBody,
  ): Promise<SuccessResponse<{ updated: true }>> {
    await this.updateSubscription.execute({
      doctorId: id,
      plan: body.plan,
      status: body.status,
      expiresAt: new Date(body.expires_at),
      notes: body.notes ?? null,
    });
    return { success: true, data: { updated: true } };
  }

  /**
   * POST /api/admin/subscriptions/extend — extend a doctor's subscription by N months.
   * Body: { doctor_id, months, reason? }
   */
  @Post('subscriptions/extend')
  async extendSubscription(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(ExtendSubscriptionBodySchema)) body: ExtendSubscriptionBody,
  ): Promise<SuccessResponse<{ newExpiresAt: Date }>> {
    const result = await this.extendSubscriptionOp.execute({
      doctorId: body.doctor_id,
      months: body.months,
      actorId: user.sub,
      reason: body.reason ?? null,
    });
    return { success: true, data: result };
  }

  /**
   * POST /api/admin/subscriptions/suspend — suspend a doctor's subscription.
   * Body: { doctor_id, reason? }
   */
  @Post('subscriptions/suspend')
  async suspendSubscription(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(SuspendSubscriptionBodySchema)) body: SuspendSubscriptionBody,
  ): Promise<SuccessResponse<{ suspended: true }>> {
    await this.suspendSubscriptionOp.execute({
      doctorId: body.doctor_id,
      actorId: user.sub,
      reason: body.reason ?? null,
    });
    return { success: true, data: { suspended: true } };
  }

  /**
   * POST /api/admin/subscriptions/reactivate — reactivate a suspended subscription.
   * Body: { doctor_id }
   */
  @Post('subscriptions/reactivate')
  async reactivateSubscription(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(ReactivateSubscriptionBodySchema)) body: ReactivateSubscriptionBody,
  ): Promise<SuccessResponse<{ newExpiresAt: Date | null }>> {
    const result = await this.reactivateSubscriptionOp.execute({
      doctorId: body.doctor_id,
      actorId: user.sub,
    });
    return { success: true, data: result };
  }

  /**
   * GET /api/admin/subscriptions — all subscriptions with optional status/plan filters.
   *
   * ?status must be a valid SubscriptionStatus — returns 400 if invalid.
   * ?plan must be a valid SubscriptionPlan — returns 400 if invalid.
   */
  @Get('subscriptions')
  async listSubscriptions(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') statusRaw?: string,
    @Query('plan') planRaw?: string,
  ): Promise<PaginatedResponse<unknown>> {
    if (
      statusRaw !== undefined &&
      !(VALID_SUBSCRIPTION_STATUSES as readonly string[]).includes(statusRaw)
    ) {
      throw new BadRequestException(
        `Invalid status '${statusRaw}'. Must be one of: ${VALID_SUBSCRIPTION_STATUSES.join(', ')}`,
      );
    }
    if (
      planRaw !== undefined &&
      !(VALID_SUBSCRIPTION_PLANS as readonly string[]).includes(planRaw)
    ) {
      throw new BadRequestException(
        `Invalid plan '${planRaw}'. Must be one of: ${VALID_SUBSCRIPTION_PLANS.join(', ')}`,
      );
    }

    const status = statusRaw as SubscriptionStatus | undefined;
    const plan = planRaw as SubscriptionPlan | undefined;

    const result = await this.getSubscriptions.execute({
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
      status,
      plan,
    });

    return {
      success: true,
      data: result.items,
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /** GET /api/admin/plans — all plan_configs ordered by sort_order */
  @Get('plans')
  async listPlans(): Promise<SuccessResponse<unknown[]>> {
    const plans = await this.getPlans.execute();
    return {
      success: true,
      data: plans.map((p) => ({
        planKey: p.planKey,
        name: p.name,
        priceUsd: p.priceUsd,
        trialDays: p.trialDays,
        isActive: p.isActive,
        description: p.description,
        sortOrder: p.sortOrder,
      })),
    };
  }

  /**
   * PUT /api/admin/plans/:planKey — toggle a plan active/inactive.
   *
   * Body is validated by TogglePlanBodySchema:
   *   - is_active: boolean (required; rejects string "true" etc.)
   */
  @Put('plans/:planKey')
  async togglePlanHandler(
    @Param('planKey') planKey: string,
    @Body(new ZodValidationPipe(TogglePlanBodySchema)) body: TogglePlanBody,
  ): Promise<SuccessResponse<unknown>> {
    const updated = await this.togglePlan.execute({ planKey, isActive: body.is_active });
    return {
      success: true,
      data: {
        planKey: updated.planKey,
        name: updated.name,
        priceUsd: updated.priceUsd,
        isActive: updated.isActive,
      },
    };
  }

  /** GET /api/admin/plan-features — all features, optionally filtered by ?plan_key=X */
  @Get('plan-features')
  async listPlanFeatures(@Query('plan_key') planKey?: string): Promise<SuccessResponse<unknown[]>> {
    const features = await this.getPlanFeatures.execute({ planKey });
    return { success: true, data: features };
  }

  /**
   * PUT /api/admin/plan-features/:planKey/:featureKey — enable/disable a feature.
   *
   * Body is validated by TogglePlanFeatureBodySchema:
   *   - feature_label: non-empty string ≤ 200 chars
   *   - enabled: boolean (required)
   */
  @Put('plan-features/:planKey/:featureKey')
  async togglePlanFeatureHandler(
    @Param('planKey') planKey: string,
    @Param('featureKey') featureKey: string,
    @Body(new ZodValidationPipe(TogglePlanFeatureBodySchema)) body: TogglePlanFeatureBody,
  ): Promise<SuccessResponse<unknown>> {
    const result = await this.togglePlanFeature.execute({
      planKey,
      featureKey,
      featureLabel: body.feature_label,
      enabled: body.enabled,
    });
    return { success: true, data: result };
  }

  /** GET /api/admin/patients — global patient statistics (no PII) */
  @Get('patients')
  async patientsStats(): Promise<SuccessResponse<unknown>> {
    const stats = await this.getPatientsStats.execute();
    return { success: true, data: stats };
  }

  /** GET /api/admin/settings — application settings (secrets excluded by repository) */
  @Get('settings')
  async settings(): Promise<SuccessResponse<unknown[]>> {
    const settings = await this.getSettings.execute();
    return { success: true, data: settings };
  }
}
