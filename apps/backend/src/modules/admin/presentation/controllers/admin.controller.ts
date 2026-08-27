import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import {
  UpdateSubscriptionBodySchema,
  TogglePlanFeatureBodySchema,
  ExtendSubscriptionBodySchema,
  SuspendSubscriptionBodySchema,
  ReactivateSubscriptionBodySchema,
  UpsertSettingBodySchema,
  UpdatePlanBodySchema,
  SetUserRoleBodySchema,
  CreatePlanBodySchema,
  UpdatePlanFullBodySchema,
  SetPlanFeaturesBodySchema,
  SetPlanPricesBodySchema,
  SetDoctorAccessBodySchema,
  CreateAdminDoctorBodySchema,
  VALID_ACTIVITY_STATUSES,
  VALID_SUBSCRIPTION_STATUSES,
  VALID_SUBSCRIPTION_PLANS,
  type UpdateSubscriptionBody,
  type TogglePlanFeatureBody,
  type ExtendSubscriptionBody,
  type SuspendSubscriptionBody,
  type ReactivateSubscriptionBody,
  type UpsertSettingBody,
  type UpdatePlanBody,
  type SetUserRoleBody,
  type CreatePlanBody,
  type UpdatePlanFullBody,
  type SetPlanFeaturesBody,
  type SetPlanPricesBody,
  type SetDoctorAccessBody,
  type CreateAdminDoctorBody,
} from '../../application/dtos/admin.dtos';
import { GetAdminDashboardUseCase } from '../../application/use-cases/admin/get-admin-dashboard.use-case';
import { GetDashboardOverviewUseCase } from '../../application/use-cases/admin/get-dashboard-overview.use-case';
import { GetRecentDoctorsUseCase } from '../../application/use-cases/admin/get-recent-doctors.use-case';
import { GetDoctorsListUseCase } from '../../application/use-cases/admin/get-doctors-list.use-case';
import { GetDoctorDetailUseCase } from '../../application/use-cases/admin/get-doctor-detail.use-case';
import { GetDoctorGrowthUseCase } from '../../application/use-cases/admin/get-doctor-growth.use-case';
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
import { UpsertSettingUseCase } from '../../application/use-cases/admin/upsert-setting.use-case';
import { UpdatePlanUseCase } from '../../application/use-cases/admin/update-plan.use-case';
import { ListAdminUsersUseCase } from '../../application/use-cases/admin/list-admin-users.use-case';
import { SetUserRoleUseCase } from '../../application/use-cases/admin/set-user-role.use-case';
import { CreatePlanUseCase } from '../../application/use-cases/admin/create-plan.use-case';
import { ListPlansWithDetailsUseCase } from '../../application/use-cases/admin/list-plans-with-details.use-case';
import { SetPlanFeaturesUseCase } from '../../application/use-cases/admin/set-plan-features.use-case';
import { SetPlanPricesUseCase } from '../../application/use-cases/admin/set-plan-prices.use-case';
import { ExportDoctorsUseCase } from '../../application/use-cases/admin/export-doctors.use-case';
import { SetDoctorAccessUseCase } from '../../application/use-cases/admin/set-doctor-access.use-case';
import { CreateAdminDoctorUseCase } from '../../application/use-cases/admin/create-admin-doctor.use-case';
import { GetDoctorPatientsUseCase } from '../../application/use-cases/admin/get-doctor-patients.use-case';
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
 * Admin controller — all endpoints require AppAuthGuard and
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
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminController {
  constructor(
    private readonly getDashboard: GetAdminDashboardUseCase,
    private readonly getDashboardOverview: GetDashboardOverviewUseCase,
    private readonly getRecentDoctors: GetRecentDoctorsUseCase,
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
    private readonly upsertSettingOp: UpsertSettingUseCase,
    private readonly updatePlanOp: UpdatePlanUseCase,
    private readonly listAdminUsersOp: ListAdminUsersUseCase,
    private readonly setUserRoleOp: SetUserRoleUseCase,
    private readonly getDoctorGrowthOp: GetDoctorGrowthUseCase,
    private readonly createPlanOp: CreatePlanUseCase,
    private readonly listPlansWithDetailsOp: ListPlansWithDetailsUseCase,
    private readonly setPlanFeaturesOp: SetPlanFeaturesUseCase,
    private readonly setPlanPricesOp: SetPlanPricesUseCase,
    private readonly exportDoctorsOp: ExportDoctorsUseCase,
    private readonly setDoctorAccessOp: SetDoctorAccessUseCase,
    private readonly createAdminDoctorOp: CreateAdminDoctorUseCase,
    private readonly getDoctorPatientsOp: GetDoctorPatientsUseCase,
  ) {}

  /**
   * Validates that a route param (planKey / featureKey) matches the expected
   * format: lowercase alphanumeric and underscores only.
   * Throws BadRequestException (400) if the format is invalid.
   */
  private static assertKeyFormat(value: string, paramName: string): void {
    if (!/^[a-z0-9_]+$/.test(value)) {
      throw new BadRequestException(
        `${paramName} inválido: '${value}'. Solo se permiten minúsculas, números y guion bajo.`,
      );
    }
  }

  /** GET /api/admin/dashboard — KPIs: doctor counts by activity, appointments, patients, expiring subscriptions */
  @Get('dashboard')
  async dashboard(): Promise<SuccessResponse<unknown>> {
    const data = await this.getDashboard.execute();
    return { success: true, data };
  }

  /**
   * GET /api/admin/dashboard/overview — supplemental KPIs for the admin home page.
   *
   * Returns fields NOT present in GET /api/admin/dashboard:
   *   - appointmentsToday / appointmentsThisMonth (appointments + walk-in consultations)
   *   - activeSubscriptions / trialSubscriptions counts
   *   - recentDoctors: top 5 doctors by created_at desc (id, fullName, specialty, subscriptionStatus)
   *
   * NOTE: This route MUST be declared BEFORE 'doctors' (no-param) and other sub-paths to
   * prevent NestJS from treating 'overview' as a doctor :id parameter.
   *
   * Cached in Redis (TTL 120s) with graceful fallback to DB.
   */
  @Get('dashboard/overview')
  async dashboardOverview(): Promise<SuccessResponse<unknown>> {
    const data = await this.getDashboardOverview.execute();
    return { success: true, data };
  }

  /**
   * GET /api/admin/doctors/recent?days=7 — doctors registered in the last N days.
   *
   * Query params:
   *   - days: integer in [1, 30], default 7
   *
   * Returns up to 10 doctors ordered by created_at desc.
   * Used by the admin notification bell to surface newly joined doctors.
   *
   * SECURITY: Returns doctor full name + email (PII). Guarded by @Roles('super_admin').
   *
   * NOTE: This static-path route MUST be declared BEFORE 'doctors/:id' to avoid
   * NestJS treating 'recent' as a doctor id.
   */
  @Get('doctors/recent')
  async recentDoctors(@Query('days') daysRaw = '7'): Promise<SuccessResponse<unknown[]>> {
    const days = Math.min(30, Math.max(1, parseInt(daysRaw, 10) || 7));
    const doctors = await this.getRecentDoctors.execute({ days });
    return {
      success: true,
      data: doctors.map((d) => ({
        id: d.id,
        fullName: d.fullName,
        email: d.email,
        createdAt: d.createdAt,
      })),
    };
  }

  /**
   * GET /api/admin/doctors/export — download all doctors as a CSV file.
   *
   * Produces a UTF-8 CSV with headers:
   *   Nombre, Email, Cédula, Especialidad, Plan, Estado suscripción,
   *   Vencimiento, Último acceso, Estado actividad
   *
   * Content-Type: text/csv; charset=utf-8
   * Content-Disposition: attachment; filename="especialistas.csv"
   *
   * SECURITY: Returns doctor PII (name, email, cédula). Guarded by @Roles('super_admin').
   *
   * NOTE: This static-path route MUST remain before 'doctors/:id' to avoid
   * NestJS treating 'export' as a doctor id parameter.
   */
  @Get('doctors/export')
  async exportDoctors(@Res() res: Response): Promise<void> {
    const csv = await this.exportDoctorsOp.execute();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="especialistas.csv"');
    res.send(csv);
  }

  /**
   * POST /api/admin/doctors — admin-provision a new doctor profile + subscription.
   *
   * Body (all fields except full_name and email are optional):
   *   - full_name:  string (required)
   *   - email:      valid email (required, must be unique)
   *   - specialty:  string | null
   *   - cedula:     string | null  (canonical form, e.g. "V-12345678")
   *   - phone:      string | null
   *   - plan:       'free_trial' | 'delta_free' | 'delta_base' | 'delta_plus'
   *                 Defaults to 'free_trial' (30-day onboarding trial) when omitted.
   *
   * Returns 409 when the email is already registered.
   *
   * SECURITY: Creating a doctor profile is a privileged admin action.
   *   - The new profile does NOT have an auth0_sub (dev-stub auth is header-based).
   *   - In Etapa 2, the admin must also provision the user in Auth0 and call
   *     PATCH /api/admin/doctors/:id/auth0-sub to link the Auth0 account.
   */
  @Post('doctors')
  @HttpCode(HttpStatus.CREATED)
  async createAdminDoctor(
    @Body(new ZodValidationPipe(CreateAdminDoctorBodySchema)) body: CreateAdminDoctorBody,
  ): Promise<SuccessResponse<unknown>> {
    const created = await this.createAdminDoctorOp.execute({
      fullName: body.full_name,
      email: body.email,
      specialty: body.specialty ?? null,
      cedula: body.cedula ?? null,
      phone: body.phone ?? null,
      plan: body.plan,
    });

    return {
      success: true,
      data: {
        id: created.id,
        fullName: created.fullName,
        email: created.email,
        specialty: created.specialty,
        cedula: created.cedula,
        plan: created.plan,
        subscriptionStatus: created.subscriptionStatus,
        subscriptionExpiresAt: created.subscriptionExpiresAt,
        createdAt: created.createdAt,
      },
    };
  }

  /**
   * GET /api/admin/doctors — paginated list with optional filters.
   *
   * ?activity_status must be one of: active | cold | inactive — returns 400 if invalid.
   * ?subscription_status must be a valid SubscriptionStatus — returns 400 if invalid.
   *
   * Activity filtering now uses real last_sign_in_at data (migration 20260612000002).
   * Buckets: active = ≤7d, cold = 8-30d, inactive = >30d or null.
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
        `activity_status inválido: '${activityStatusRaw}'. Debe ser uno de: ${VALID_ACTIVITY_STATUSES.join(', ')}`,
      );
    }
    if (
      subscriptionStatusRaw !== undefined &&
      !(VALID_SUBSCRIPTION_STATUSES as readonly string[]).includes(subscriptionStatusRaw)
    ) {
      throw new BadRequestException(
        `subscription_status inválido: '${subscriptionStatusRaw}'. Debe ser uno de: ${VALID_SUBSCRIPTION_STATUSES.join(', ')}`,
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
        /** Real last login timestamp (null until Auth0 Fase 4 is active). */
        lastSignInAt: d.lastSignInAt,
        /** Doctor identity document (PII — super_admin only). */
        cedula: d.cedula,
      })),
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /**
   * GET /api/admin/doctors/:doctorId/patients — list patients attended by a doctor.
   *
   * Returns patient identity (fullName + cedula) plus consultation aggregate data
   * (consultationCount + lastAttendedAt). Explicitly excludes all medical content
   * (diagnosis, treatment, EHR, prescriptions) and all contact data (phone, email).
   *
   * Each request is recorded in access_audit_log with:
   *   fieldRevealed = 'admin_patient_identity'
   *   patientId     = doctorId (bulk-reveal proxy — no single patient applies)
   *   reason        = 'admin listed patients for doctor <doctorId>'
   *
   * Anti-IDOR: the scope is strictly bound to :doctorId in the repository query.
   *
   * NOTE: This route is declared BEFORE 'doctors/:id' to prevent NestJS from
   * matching 'doctors/:doctorId/patients' with the detail handler and treating
   * 'patients' as the :id segment.
   *
   * SECURITY: returns PII (fullName, cedula). Guarded by @Roles('super_admin').
   */
  @Get('doctors/:doctorId/patients')
  async getDoctorPatients(
    @CurrentUser() user: CurrentUserPayload,
    @Param('doctorId') doctorId: string,
    @Req() req: Request,
  ): Promise<SuccessResponse<unknown[]>> {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress ??
      null;
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;

    const patients = await this.getDoctorPatientsOp.execute({
      doctorId,
      actorId: user.sub,
      actorRole: user.role,
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      data: patients.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        cedula: p.cedula,
        consultationCount: p.consultationCount,
        lastAttendedAt: p.lastAttendedAt,
      })),
    };
  }

  /** GET /api/admin/doctors/:id — enriched detail for a single doctor */
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
        phone: doctor.phone,
        cedula: doctor.cedula,
        city: doctor.city,
        state: doctor.state,
        isActive: doctor.isActive,
        createdAt: doctor.createdAt,
        subscriptionStatus: doctor.subscriptionStatus,
        subscriptionPlan: doctor.subscriptionPlan,
        subscriptionExpiresAt: doctor.subscriptionExpiresAt,
        activityStatus: doctor.activityStatus,
        lastSignInAt: doctor.lastSignInAt,
        patientCount: doctor.patientCount,
        consultationCount: doctor.consultationCount,
        monthlyRevenue: doctor.monthlyRevenue,
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
   * PUT /api/admin/doctors/:id/access — block or unblock a doctor account.
   *
   * Body: { is_active: boolean, reason?: string }
   *
   * Sets profiles.is_active for the target doctor. is_active=false is a hard ban:
   * AppAuthGuard will return 403 ACCOUNT_BLOCKED on every subsequent request
   * from that profile, regardless of verification or subscription status.
   *
   * Business rules (enforced by SetDoctorAccessUseCase):
   *   - Target profile must exist.
   *   - Cannot block a super_admin profile (CANNOT_BLOCK_SUPER_ADMIN → 422).
   *   - Cannot block one's own account (CANNOT_BLOCK_SELF → 422).
   *
   * SECURITY: actorId is always read from request.user.sub (anti-IDOR).
   */
  @Put('doctors/:id/access')
  async setDoctorAccess(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') targetId: string,
    @Body(new ZodValidationPipe(SetDoctorAccessBodySchema)) body: SetDoctorAccessBody,
  ): Promise<SuccessResponse<{ id: string; isActive: boolean }>> {
    const result = await this.setDoctorAccessOp.execute({
      targetId,
      actorId: user.sub,
      isActive: body.is_active,
      reason: body.reason,
    });
    return { success: true, data: result };
  }

  /**
   * GET /api/admin/subscriptions/growth — doctor registration growth for the last 6 months.
   *
   * This static-path route is declared BEFORE any parametric subscription routes to
   * guarantee NestJS resolves it first (no collision risk with a future :param).
   *
   * Shape: { success: true, data: { chartData: [{ month, count }], momGrowth, newThisMonth } }
   */
  @Get('subscriptions/growth')
  async subscriptionsGrowth(): Promise<SuccessResponse<unknown>> {
    const data = await this.getDoctorGrowthOp.execute();
    return { success: true, data };
  }

  /**
   * POST /api/admin/subscriptions/extend — extend a doctor's subscription by N days or months.
   * Body: { doctor_id, months?, days?, reason? } — exactly one of months or days is required.
   */
  @Post('subscriptions/extend')
  async extendSubscription(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(ExtendSubscriptionBodySchema)) body: ExtendSubscriptionBody,
  ): Promise<SuccessResponse<{ newExpiresAt: Date }>> {
    const result = await this.extendSubscriptionOp.execute({
      doctorId: body.doctor_id,
      months: body.months,
      days: body.days,
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
        `Estado inválido: '${statusRaw}'. Debe ser uno de: ${VALID_SUBSCRIPTION_STATUSES.join(', ')}`,
      );
    }
    if (
      planRaw !== undefined &&
      !(VALID_SUBSCRIPTION_PLANS as readonly string[]).includes(planRaw)
    ) {
      throw new BadRequestException(
        `Plan inválido: '${planRaw}'. Debe ser uno de: ${VALID_SUBSCRIPTION_PLANS.join(', ')}`,
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

  /**
   * GET /api/admin/plans — all plan_configs with their prices[] and features[].
   *
   * Returns the enriched matrix (prices per period, enabled/disabled features)
   * that the frontend admin panel uses to display and edit the plan catalog.
   */
  @Get('plans')
  async listPlans(): Promise<SuccessResponse<unknown[]>> {
    const plans = await this.listPlansWithDetailsOp.execute();
    return { success: true, data: plans };
  }

  /**
   * POST /api/admin/plans — create a new plan.
   *
   * Body: { plan_key, name, role_key?, is_permanent?, is_active?, sort_order?, description? }
   *
   * Throws 409 if a plan with the same plan_key already exists.
   */
  @Post('plans')
  async createPlan(
    @Body(new ZodValidationPipe(CreatePlanBodySchema)) body: CreatePlanBody,
  ): Promise<SuccessResponse<unknown>> {
    const created = await this.createPlanOp.execute({
      planKey: body.plan_key,
      name: body.name,
      roleKey: body.role_key,
      isPermanent: body.is_permanent,
      isActive: body.is_active,
      sortOrder: body.sort_order,
      description: body.description ?? null,
    });
    return {
      success: true,
      data: {
        planKey: created.planKey,
        name: created.name,
        roleKey: created.roleKey,
        isPermanent: created.isPermanent,
        isActive: created.isActive,
        sortOrder: created.sortOrder,
        description: created.description,
      },
    };
  }

  /**
   * PUT /api/admin/plans/:planKey — edit plan metadata (name, is_active, sort_order, etc.).
   *
   * Accepts any subset of editable fields. At least one must be provided.
   * Replaces the old TogglePlan endpoint — is_active is now part of this body.
   *
   * The legacy PUT /admin/plans/:planKey/config endpoint for price edits is
   * preserved below for backward compatibility.
   */
  @Put('plans/:planKey')
  async updatePlanHandler(
    @Param('planKey') planKey: string,
    @Body(new ZodValidationPipe(UpdatePlanFullBodySchema)) body: UpdatePlanFullBody,
  ): Promise<SuccessResponse<unknown>> {
    AdminController.assertKeyFormat(planKey, 'planKey');
    const updated = await this.updatePlanOp.execute({
      planKey,
      name: body.name,
      isActive: body.is_active,
      sortOrder: body.sort_order,
      isPermanent: body.is_permanent,
      description: body.description,
    });
    return {
      success: true,
      data: {
        planKey: updated.planKey,
        name: updated.name,
        priceUsd: updated.priceUsd,
        trialDays: updated.trialDays,
        isActive: updated.isActive,
        sortOrder: updated.sortOrder,
        description: updated.description,
        roleKey: updated.roleKey,
        isPermanent: updated.isPermanent,
      },
    };
  }

  /**
   * PUT /api/admin/plans/:planKey/features — bulk-set the feature matrix for a plan.
   *
   * Body: { features: [{ feature_key, feature_label, enabled }] }
   * At least one feature must be provided.
   * Uses upsert semantics — existing entries are overwritten.
   */
  @Put('plans/:planKey/features')
  async setPlanFeaturesHandler(
    @Param('planKey') planKey: string,
    @Body(new ZodValidationPipe(SetPlanFeaturesBodySchema)) body: SetPlanFeaturesBody,
  ): Promise<SuccessResponse<unknown[]>> {
    AdminController.assertKeyFormat(planKey, 'planKey');
    const features = await this.setPlanFeaturesOp.execute({
      planKey,
      features: body.features.map((f) => ({
        featureKey: f.feature_key,
        featureLabel: f.feature_label,
        enabled: f.enabled,
      })),
    });
    return { success: true, data: features };
  }

  /**
   * PUT /api/admin/plans/:planKey/prices — bulk-set prices per billing period.
   *
   * Body: { prices: [{ period, price_usd, is_active? }] }
   * At least one price entry must be provided.
   * Uses upsert semantics — existing (plan_key, period) rows are overwritten.
   */
  @Put('plans/:planKey/prices')
  async setPlanPricesHandler(
    @Param('planKey') planKey: string,
    @Body(new ZodValidationPipe(SetPlanPricesBodySchema)) body: SetPlanPricesBody,
  ): Promise<SuccessResponse<unknown[]>> {
    AdminController.assertKeyFormat(planKey, 'planKey');
    const prices = await this.setPlanPricesOp.execute({
      planKey,
      prices: body.prices.map((p) => ({
        period: p.period,
        priceUsd: p.price_usd,
        isActive: p.is_active,
      })),
    });
    return { success: true, data: prices };
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
    AdminController.assertKeyFormat(planKey, 'planKey');
    AdminController.assertKeyFormat(featureKey, 'featureKey');
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

  /**
   * PUT /api/admin/settings — upsert a single key-value pair in app_settings.
   *
   * Body: { key: string, value: string | number | boolean | object | array }
   * Non-string values are serialised to JSON before being stored.
   *
   * Protected keys (encryption_key, jwt_secret, usdt_rate_raw) are rejected with 422.
   * usdt_rate_raw is owned by the finances module — use POST /api/admin/settings/usdt-rate
   * to update the USDT/BCV rate (already implemented in finances/settings.controller.ts).
   */
  @Put('settings')
  async upsertSetting(
    @Body(new ZodValidationPipe(UpsertSettingBodySchema)) body: UpsertSettingBody,
  ): Promise<SuccessResponse<unknown>> {
    const valueStr = typeof body.value === 'string' ? body.value : JSON.stringify(body.value);

    const saved = await this.upsertSettingOp.execute({ key: body.key, value: valueStr });
    return { success: true, data: saved };
  }

  /**
   * PUT /api/admin/plans/:planKey/config — edit plan editable fields (name, price, trial_days, sort_order).
   *
   * At least one field must be provided. is_active is NOT accepted here — use
   * PUT /api/admin/plans/:planKey (TogglePlan) to activate/deactivate.
   */
  @Put('plans/:planKey/config')
  async updatePlanConfig(
    @Param('planKey') planKey: string,
    @Body(new ZodValidationPipe(UpdatePlanBodySchema)) body: UpdatePlanBody,
  ): Promise<SuccessResponse<unknown>> {
    AdminController.assertKeyFormat(planKey, 'planKey');
    const updated = await this.updatePlanOp.execute({
      planKey,
      name: body.name,
      price: body.price,
      trialDays: body.trial_days,
      sortOrder: body.sort_order,
      description: body.description,
    });
    return {
      success: true,
      data: {
        planKey: updated.planKey,
        name: updated.name,
        priceUsd: updated.priceUsd,
        trialDays: updated.trialDays,
        isActive: updated.isActive,
        description: updated.description,
        sortOrder: updated.sortOrder,
      },
    };
  }

  /**
   * GET /api/admin/admins — list all super_admin profiles.
   *
   * NOTE: This endpoint returns PII (full name, email). It is super_admin–only
   * and must never be cached or logged.
   */
  @Get('admins')
  async listAdmins(): Promise<SuccessResponse<unknown[]>> {
    const admins = await this.listAdminUsersOp.execute();
    return {
      success: true,
      data: admins.map((a) => ({
        id: a.id,
        fullName: a.fullName,
        email: a.email,
        role: a.role,
        createdAt: a.createdAt,
      })),
    };
  }

  /**
   * PUT /api/admin/admins/:id/role — grant or revoke super_admin role.
   *
   * Body: { role: 'super_admin' | 'doctor' }
   *
   * Business rules enforced by SetUserRoleUseCase:
   *   - Target user must exist.
   *   - Actor cannot demote themselves.
   *   - The last super_admin cannot be demoted.
   */
  @Put('admins/:id/role')
  async setAdminRole(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') targetId: string,
    @Body(new ZodValidationPipe(SetUserRoleBodySchema)) body: SetUserRoleBody,
  ): Promise<SuccessResponse<{ updated: true }>> {
    await this.setUserRoleOp.execute({
      targetUserId: targetId,
      actorUserId: user.sub,
      newRole: body.role,
    });
    return { success: true, data: { updated: true } };
  }
}
