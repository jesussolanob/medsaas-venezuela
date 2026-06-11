import { Test, type TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import {
  UpdateSubscriptionBodySchema,
  TogglePlanFeatureBodySchema,
  UpdatePlanFullBodySchema,
} from '../../application/dtos/admin.dtos';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Reflector } from '@nestjs/core';
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
import { DoctorWithActivity } from '../../domain/entities/doctor-with-activity.entity';
import type { DoctorDetail, DoctorGrowthData } from '../../domain/repositories/admin.repository';
import { PlanConfig } from '../../domain/value-objects/plan-config.vo';
import { SettingNotAllowedError } from '../../domain/errors/setting-not-allowed.error';
import { AdminUserNotFoundError } from '../../domain/errors/admin-user-not-found.error';
import {
  UpsertSettingBodySchema,
  UpdatePlanBodySchema,
  SetUserRoleBodySchema,
  SetPlanFeaturesBodySchema,
  SetPlanPricesBodySchema,
} from '../../application/dtos/admin.dtos';

const dashboardData = {
  totalDoctors: 5,
  activeDoctors: 1,
  coldDoctors: 1,
  inactiveDoctors: 3,
  appointmentsLast30Days: 20,
  totalPatients: 100,
  expiringSubscriptionsCount: 1,
};

const sampleDoctor = new DoctorWithActivity(
  'doc-1',
  'Dr. House',
  'house@test.com',
  'Diagnostics',
  'active',
  'professional',
  new Date('2026-12-31'),
  null,
);

const sampleDoctorDetail: DoctorDetail = {
  id: 'doc-1',
  fullName: 'Dr. House',
  email: 'house@test.com',
  specialty: 'Diagnostics',
  phone: null,
  cedula: null,
  city: null,
  state: null,
  isActive: true,
  createdAt: new Date('2025-01-01'),
  subscriptionStatus: 'active',
  subscriptionPlan: 'professional',
  subscriptionExpiresAt: new Date('2026-12-31'),
  activityStatus: 'inactive',
  lastSignInAt: null,
  patientCount: 5,
  consultationCount: 2,
  monthlyRevenue: 100,
};

const sampleGrowthData: DoctorGrowthData = {
  chartData: [
    { month: '2026-01', count: 1 },
    { month: '2026-02', count: 2 },
    { month: '2026-03', count: 0 },
    { month: '2026-04', count: 3 },
    { month: '2026-05', count: 2 },
    { month: '2026-06', count: 4 },
  ],
  newThisMonth: 4,
  momGrowth: 100,
};

const samplePlan = new PlanConfig('basic', 'Basic', 10, 0, true, null, 1);

const sampleFeature = {
  id: 'feat-1',
  plan: 'basic',
  featureKey: 'agenda',
  featureLabel: 'Agenda',
  enabled: true,
};

const buildModule = async (): Promise<TestingModule> => {
  const mockDashboard = { execute: jest.fn().mockResolvedValue(dashboardData) };
  const mockDoctorsList = {
    execute: jest.fn().mockResolvedValue({ items: [sampleDoctor], total: 1, page: 1, limit: 20 }),
  };
  const mockDoctorDetail = { execute: jest.fn().mockResolvedValue(sampleDoctorDetail) };
  const mockUpdateSub = { execute: jest.fn().mockResolvedValue(undefined) };
  const mockGetSubs = {
    execute: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
  };
  const mockGetPlans = { execute: jest.fn().mockResolvedValue([samplePlan]) };
  const mockTogglePlan = { execute: jest.fn().mockResolvedValue(samplePlan) };
  const mockGetFeatures = { execute: jest.fn().mockResolvedValue([sampleFeature]) };
  const mockToggleFeature = { execute: jest.fn().mockResolvedValue(sampleFeature) };
  const mockPatientsStats = {
    execute: jest.fn().mockResolvedValue({ totalPatients: 100, patientsByDoctor: [] }),
  };
  const mockSettings = {
    execute: jest
      .fn()
      .mockResolvedValue([{ key: 'app_name', value: 'Delta', updatedAt: new Date() }]),
  };
  const mockExtendSub = { execute: jest.fn().mockResolvedValue({ newExpiresAt: new Date() }) };
  const mockSuspendSub = { execute: jest.fn().mockResolvedValue(undefined) };
  const mockReactivateSub = { execute: jest.fn().mockResolvedValue({ newExpiresAt: null }) };
  const mockUpsertSetting = {
    execute: jest
      .fn()
      .mockResolvedValue({ key: 'app_name', value: 'Delta', updatedAt: new Date() }),
  };
  const mockUpdatePlan = {
    execute: jest.fn().mockResolvedValue(samplePlan),
  };
  const mockListAdminUsers = {
    execute: jest.fn().mockResolvedValue([
      {
        id: 'uuid-admin',
        fullName: 'Alice',
        email: 'alice@delta.com',
        role: 'super_admin',
        createdAt: new Date(),
      },
    ]),
  };
  const mockSetUserRole = { execute: jest.fn().mockResolvedValue(undefined) };
  const mockDoctorGrowth = { execute: jest.fn().mockResolvedValue(sampleGrowthData) };
  const mockDashboardOverview = {
    execute: jest.fn().mockResolvedValue({
      appointmentsToday: 3,
      appointmentsThisMonth: 20,
      activeSubscriptions: 10,
      trialSubscriptions: 5,
      recentDoctors: [],
    }),
  };
  const mockRecentDoctors = { execute: jest.fn().mockResolvedValue([]) };
  const mockCreatePlan = { execute: jest.fn().mockResolvedValue(samplePlan) };
  const mockListPlansWithDetails = {
    execute: jest.fn().mockResolvedValue([
      {
        planKey: 'basic',
        name: 'Basic',
        priceUsd: 10,
        trialDays: 0,
        isActive: true,
        description: null,
        sortOrder: 1,
        roleKey: 'doctor',
        isPermanent: false,
        prices: [],
        features: [],
      },
    ]),
  };
  const mockSetPlanFeatures = { execute: jest.fn().mockResolvedValue([]) };
  const mockSetPlanPrices = { execute: jest.fn().mockResolvedValue([]) };

  return Test.createTestingModule({
    controllers: [AdminController],
    providers: [
      Reflector,
      { provide: GetAdminDashboardUseCase, useValue: mockDashboard },
      { provide: GetDoctorsListUseCase, useValue: mockDoctorsList },
      { provide: GetDoctorDetailUseCase, useValue: mockDoctorDetail },
      { provide: UpdateDoctorSubscriptionUseCase, useValue: mockUpdateSub },
      { provide: GetSubscriptionsUseCase, useValue: mockGetSubs },
      { provide: GetPlansUseCase, useValue: mockGetPlans },
      { provide: TogglePlanUseCase, useValue: mockTogglePlan },
      { provide: GetPlanFeaturesUseCase, useValue: mockGetFeatures },
      { provide: TogglePlanFeatureUseCase, useValue: mockToggleFeature },
      { provide: GetPatientsStatsUseCase, useValue: mockPatientsStats },
      { provide: GetSettingsUseCase, useValue: mockSettings },
      { provide: ExtendDoctorSubscriptionUseCase, useValue: mockExtendSub },
      { provide: SuspendDoctorSubscriptionUseCase, useValue: mockSuspendSub },
      { provide: ReactivateDoctorSubscriptionUseCase, useValue: mockReactivateSub },
      { provide: UpsertSettingUseCase, useValue: mockUpsertSetting },
      { provide: UpdatePlanUseCase, useValue: mockUpdatePlan },
      { provide: ListAdminUsersUseCase, useValue: mockListAdminUsers },
      { provide: SetUserRoleUseCase, useValue: mockSetUserRole },
      { provide: GetDoctorGrowthUseCase, useValue: mockDoctorGrowth },
      { provide: GetDashboardOverviewUseCase, useValue: mockDashboardOverview },
      { provide: GetRecentDoctorsUseCase, useValue: mockRecentDoctors },
      { provide: CreatePlanUseCase, useValue: mockCreatePlan },
      { provide: ListPlansWithDetailsUseCase, useValue: mockListPlansWithDetails },
      { provide: SetPlanFeaturesUseCase, useValue: mockSetPlanFeatures },
      { provide: SetPlanPricesUseCase, useValue: mockSetPlanPrices },
    ],
  })
    .overrideGuard(DevAuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: () => true })
    .compile();
};

describe('AdminController', () => {
  let controller: AdminController;
  let module: TestingModule;

  beforeEach(async () => {
    module = await buildModule();
    controller = module.get(AdminController);
  });

  afterEach(() => module.close());

  describe('GET /admin/dashboard', () => {
    it('returns dashboard KPIs', async () => {
      const result = await controller.dashboard();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(dashboardData);
    });
  });

  describe('GET /admin/doctors', () => {
    it('returns paginated list of doctors', async () => {
      const result = await controller.listDoctors('1', '20');
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.meta.total).toBe(1);
    });

    it('passes activityStatus filter to use case', async () => {
      const mockDoctorsList = module.get(
        GetDoctorsListUseCase,
      ) as jest.Mocked<GetDoctorsListUseCase>;
      mockDoctorsList.execute.mockClear();
      await controller.listDoctors('1', '20', 'inactive');
      expect(mockDoctorsList.execute).toHaveBeenCalledWith(
        expect.objectContaining({ activityStatus: 'inactive' }),
      );
    });
  });

  describe('GET /admin/doctors/:id', () => {
    it('returns doctor detail with enriched fields', async () => {
      const result = await controller.getDoctorById('doc-1');
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.id).toBe('doc-1');
      expect(data.patientCount).toBe(5);
      expect(data.consultationCount).toBe(2);
      expect(data.monthlyRevenue).toBe(100);
    });

    it('includes profile extension fields in detail response', async () => {
      const result = await controller.getDoctorById('doc-1');
      const data = result.data as Record<string, unknown>;
      expect('phone' in data).toBe(true);
      expect('cedula' in data).toBe(true);
      expect('city' in data).toBe(true);
      expect('state' in data).toBe(true);
      expect('isActive' in data).toBe(true);
      expect('createdAt' in data).toBe(true);
    });
  });

  describe('GET /admin/subscriptions/growth', () => {
    it('returns growth chart data with 6 months', async () => {
      const result = await controller.subscriptionsGrowth();
      expect(result.success).toBe(true);
      const data = result.data as typeof sampleGrowthData;
      expect(data.chartData).toHaveLength(6);
      expect(data.newThisMonth).toBe(4);
      expect(data.momGrowth).toBe(100);
    });
  });

  describe('PUT /admin/doctors/:id/subscription', () => {
    it('returns updated: true on success', async () => {
      const result = await controller.updateDoctorSubscription('doc-1', {
        plan: 'professional',
        status: 'active',
        expires_at: '2027-01-01T00:00:00Z',
      });
      expect(result.success).toBe(true);
      expect((result.data as { updated: boolean }).updated).toBe(true);
    });
  });

  describe('GET /admin/subscriptions', () => {
    it('returns subscription list', async () => {
      const result = await controller.listSubscriptions();
      expect(result.success).toBe(true);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('GET /admin/plans', () => {
    it('returns list of plans', async () => {
      const result = await controller.listPlans();
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data[0] as { planKey: string }).planKey).toBe('basic');
    });
  });

  describe('PUT /admin/plans/:planKey', () => {
    it('returns updated plan', async () => {
      const result = await controller.updatePlanHandler('basic', { is_active: false });
      expect(result.success).toBe(true);
    });
  });

  describe('GET /admin/plan-features', () => {
    it('returns list of plan features', async () => {
      const result = await controller.listPlanFeatures();
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('PUT /admin/plan-features/:planKey/:featureKey', () => {
    it('returns updated feature', async () => {
      const result = await controller.togglePlanFeatureHandler('basic', 'agenda', {
        feature_label: 'Agenda',
        enabled: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('GET /admin/patients', () => {
    it('returns patient stats without PII', async () => {
      const result = await controller.patientsStats();
      expect(result.success).toBe(true);
      expect((result.data as { totalPatients: number }).totalPatients).toBe(100);
    });
  });

  describe('GET /admin/settings', () => {
    it('returns settings list', async () => {
      const result = await controller.settings();
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('GET /admin/doctors — query param enum filtering', () => {
    it('passes valid activityStatus to use case', async () => {
      const mockDoctorsList2 = module.get(
        GetDoctorsListUseCase,
      ) as jest.Mocked<GetDoctorsListUseCase>;
      mockDoctorsList2.execute.mockClear();
      await controller.listDoctors('1', '20', 'cold');
      expect(mockDoctorsList2.execute).toHaveBeenCalledWith(
        expect.objectContaining({ activityStatus: 'cold' }),
      );
    });

    it('throws BadRequestException for invalid activityStatus', async () => {
      await expect(controller.listDoctors('1', '20', 'DROP TABLE doctors--')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for invalid subscriptionStatus', async () => {
      await expect(controller.listDoctors('1', '20', undefined, 'not_a_status')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts undefined activityStatus (no filter)', async () => {
      const mockDoctorsList2 = module.get(
        GetDoctorsListUseCase,
      ) as jest.Mocked<GetDoctorsListUseCase>;
      mockDoctorsList2.execute.mockClear();
      await controller.listDoctors('1', '20', undefined);
      expect(mockDoctorsList2.execute).toHaveBeenCalledWith(
        expect.objectContaining({ activityStatus: undefined }),
      );
    });
  });

  describe('Input validation — UpdateSubscriptionBodySchema', () => {
    const pipe = new ZodValidationPipe(UpdateSubscriptionBodySchema);

    it('accepts a valid subscription update body', () => {
      const body = { plan: 'professional', status: 'active', expires_at: '2027-01-01T00:00:00Z' };
      expect(() => pipe.transform(body)).not.toThrow();
    });

    it('rejects an invalid expires_at (plain date string without time)', () => {
      const body = { plan: 'professional', status: 'active', expires_at: '2027-01-01' };
      expect(() => pipe.transform(body)).toThrow(BadRequestException);
    });

    it('rejects an invalid expires_at ("not-a-date")', () => {
      const body = { plan: 'professional', status: 'active', expires_at: 'not-a-date' };
      expect(() => pipe.transform(body)).toThrow(BadRequestException);
    });

    it('rejects an invalid plan value', () => {
      const body = { plan: 'ultra', status: 'active', expires_at: '2027-01-01T00:00:00Z' };
      expect(() => pipe.transform(body)).toThrow(BadRequestException);
    });

    it('rejects an invalid status value', () => {
      const body = { plan: 'basic', status: 'hacked', expires_at: '2027-01-01T00:00:00Z' };
      expect(() => pipe.transform(body)).toThrow(BadRequestException);
    });
  });

  describe('Input validation — UpdatePlanFullBodySchema', () => {
    const pipe = new ZodValidationPipe(UpdatePlanFullBodySchema);

    it('accepts { is_active: false }', () => {
      expect(() => pipe.transform({ is_active: false })).not.toThrow();
    });

    it('rejects string "true" instead of boolean', () => {
      expect(() => pipe.transform({ is_active: 'true' })).toThrow(BadRequestException);
    });

    it('rejects missing is_active', () => {
      expect(() => pipe.transform({})).toThrow(BadRequestException);
    });
  });

  describe('Input validation — TogglePlanFeatureBodySchema', () => {
    const pipe = new ZodValidationPipe(TogglePlanFeatureBodySchema);

    it('accepts valid feature toggle body', () => {
      expect(() => pipe.transform({ feature_label: 'Agenda', enabled: true })).not.toThrow();
    });

    it('rejects empty feature_label', () => {
      expect(() => pipe.transform({ feature_label: '', enabled: true })).toThrow(
        BadRequestException,
      );
    });

    it('rejects non-boolean enabled', () => {
      expect(() => pipe.transform({ feature_label: 'Agenda', enabled: 1 })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('PUT /admin/settings', () => {
    it('returns saved setting on successful upsert', async () => {
      const result = await controller.upsertSetting({ key: 'app_name', value: 'Delta' });
      expect(result.success).toBe(true);
      expect((result.data as { key: string }).key).toBe('app_name');
    });

    it('propagates SettingNotAllowedError for protected keys', async () => {
      const mockUpsertSettingOp = module.get(
        UpsertSettingUseCase,
      ) as jest.Mocked<UpsertSettingUseCase>;
      mockUpsertSettingOp.execute.mockRejectedValueOnce(
        new SettingNotAllowedError('encryption_key'),
      );

      await expect(
        controller.upsertSetting({ key: 'encryption_key', value: 'hacked' }),
      ).rejects.toThrow(SettingNotAllowedError);
    });
  });

  describe('PUT /admin/plans/:planKey/config', () => {
    it('returns updated plan on success', async () => {
      const result = await controller.updatePlanConfig('basic', { price: 15 });
      expect(result.success).toBe(true);
      expect((result.data as { planKey: string }).planKey).toBe('basic');
    });
  });

  describe('GET /admin/admins', () => {
    it('returns list of admin users', async () => {
      const result = await controller.listAdmins();
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data[0] as { role: string }).role).toBe('super_admin');
    });
  });

  describe('PUT /admin/admins/:id/role', () => {
    const actor = { sub: 'uuid-actor', role: 'super_admin' as const, email: 'actor@dev.local' };

    it('returns updated: true on success', async () => {
      const result = await controller.setAdminRole(actor, 'uuid-target', { role: 'doctor' });
      expect(result.success).toBe(true);
      expect(result.data.updated).toBe(true);
    });

    it('propagates AdminUserNotFoundError when target does not exist', async () => {
      const mockSetRole = module.get(SetUserRoleUseCase) as jest.Mocked<SetUserRoleUseCase>;
      mockSetRole.execute.mockRejectedValueOnce(new AdminUserNotFoundError('nonexistent'));

      await expect(
        controller.setAdminRole(actor, 'nonexistent', { role: 'doctor' }),
      ).rejects.toThrow(AdminUserNotFoundError);
    });
  });

  describe('Input validation — UpsertSettingBodySchema', () => {
    const pipe = new ZodValidationPipe(UpsertSettingBodySchema);

    it('accepts string value', () => {
      expect(() => pipe.transform({ key: 'app_name', value: 'Delta' })).not.toThrow();
    });

    it('accepts numeric value', () => {
      expect(() => pipe.transform({ key: 'price', value: 10 })).not.toThrow();
    });

    it('accepts boolean value', () => {
      expect(() => pipe.transform({ key: 'feature_on', value: true })).not.toThrow();
    });

    it('rejects missing key', () => {
      expect(() => pipe.transform({ value: 'Delta' })).toThrow(BadRequestException);
    });

    it('rejects empty key', () => {
      expect(() => pipe.transform({ key: '', value: 'Delta' })).toThrow(BadRequestException);
    });
  });

  describe('Input validation — UpdatePlanBodySchema', () => {
    const pipe = new ZodValidationPipe(UpdatePlanBodySchema);

    it('accepts price-only update', () => {
      expect(() => pipe.transform({ price: 20 })).not.toThrow();
    });

    it('accepts all editable fields including description', () => {
      expect(() =>
        pipe.transform({
          name: 'Pro',
          price: 30,
          trial_days: 7,
          sort_order: 2,
          description: 'Best plan',
        }),
      ).not.toThrow();
    });

    it('accepts description-only update', () => {
      expect(() => pipe.transform({ description: 'Updated description' })).not.toThrow();
    });

    it('accepts null description (clear)', () => {
      expect(() => pipe.transform({ description: null })).not.toThrow();
    });

    it('rejects description exceeding 1000 chars', () => {
      expect(() => pipe.transform({ description: 'x'.repeat(1001) })).toThrow(BadRequestException);
    });

    it('rejects empty body (at least one field required)', () => {
      expect(() => pipe.transform({})).toThrow(BadRequestException);
    });

    it('rejects negative price', () => {
      expect(() => pipe.transform({ price: -5 })).toThrow(BadRequestException);
    });
  });

  describe('Input validation — SetUserRoleBodySchema', () => {
    const pipe = new ZodValidationPipe(SetUserRoleBodySchema);

    it('accepts super_admin role', () => {
      expect(() => pipe.transform({ role: 'super_admin' })).not.toThrow();
    });

    it('accepts doctor role', () => {
      expect(() => pipe.transform({ role: 'doctor' })).not.toThrow();
    });

    it('rejects patient role (not a valid admin management role)', () => {
      expect(() => pipe.transform({ role: 'patient' })).toThrow(BadRequestException);
    });

    it('rejects missing role', () => {
      expect(() => pipe.transform({})).toThrow(BadRequestException);
    });
  });

  describe('Route param format validation — planKey / featureKey', () => {
    it('PUT plans/:planKey rejects planKey with uppercase letters', async () => {
      await expect(controller.updatePlanHandler('INVALID', { is_active: true })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('PUT plans/:planKey accepts valid planKey', async () => {
      const result = await controller.updatePlanHandler('delta_base', { is_active: true });
      expect(result.success).toBe(true);
    });

    it('PUT plans/:planKey rejects planKey with hyphen', async () => {
      await expect(controller.updatePlanHandler('delta-base', { is_active: true })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('PUT plans/:planKey/features rejects planKey with spaces', async () => {
      await expect(
        controller.setPlanFeaturesHandler('delta base', {
          features: [{ feature_key: 'agenda', feature_label: 'Agenda', enabled: true }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('PUT plans/:planKey/prices rejects planKey with special characters', async () => {
      await expect(
        controller.setPlanPricesHandler('delta@base', {
          prices: [{ period: 'monthly', price_usd: 10, is_active: true }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('PUT plan-features/:planKey/:featureKey rejects invalid featureKey', async () => {
      await expect(
        controller.togglePlanFeatureHandler('delta_base', 'FEATURE-KEY', {
          feature_label: 'Agenda',
          enabled: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('PUT plan-features/:planKey/:featureKey accepts valid keys', async () => {
      const result = await controller.togglePlanFeatureHandler('delta_base', 'agenda', {
        feature_label: 'Agenda',
        enabled: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Input validation — SetPlanFeaturesBodySchema', () => {
    const pipe = new ZodValidationPipe(SetPlanFeaturesBodySchema);

    it('accepts a valid features array', () => {
      expect(() =>
        pipe.transform({
          features: [{ feature_key: 'agenda', feature_label: 'Agenda', enabled: true }],
        }),
      ).not.toThrow();
    });

    it('rejects empty features array', () => {
      expect(() => pipe.transform({ features: [] })).toThrow(BadRequestException);
    });

    it('rejects features array exceeding 50 entries', () => {
      const features = Array.from({ length: 51 }, (_, i) => ({
        feature_key: `feat_${i}`,
        feature_label: `Feature ${i}`,
        enabled: true,
      }));
      expect(() => pipe.transform({ features })).toThrow(BadRequestException);
    });

    it('accepts features array with exactly 50 entries', () => {
      const features = Array.from({ length: 50 }, (_, i) => ({
        feature_key: `feat_${i}`,
        feature_label: `Feature ${i}`,
        enabled: true,
      }));
      expect(() => pipe.transform({ features })).not.toThrow();
    });
  });

  describe('Input validation — SetPlanPricesBodySchema', () => {
    const pipe = new ZodValidationPipe(SetPlanPricesBodySchema);

    it('accepts a valid prices array', () => {
      expect(() =>
        pipe.transform({ prices: [{ period: 'monthly', price_usd: 10, is_active: true }] }),
      ).not.toThrow();
    });

    it('rejects empty prices array', () => {
      expect(() => pipe.transform({ prices: [] })).toThrow(BadRequestException);
    });

    it('rejects prices array with more than 4 entries', () => {
      const prices = [
        { period: 'monthly', price_usd: 10, is_active: true },
        { period: 'quarterly', price_usd: 27, is_active: true },
        { period: 'semiannual', price_usd: 51, is_active: true },
        { period: 'annual', price_usd: 96, is_active: true },
        { period: 'monthly', price_usd: 5, is_active: false },
      ];
      expect(() => pipe.transform({ prices })).toThrow(BadRequestException);
    });

    it('accepts prices array with exactly 4 entries', () => {
      const prices = [
        { period: 'monthly', price_usd: 10, is_active: true },
        { period: 'quarterly', price_usd: 27, is_active: true },
        { period: 'semiannual', price_usd: 51, is_active: true },
        { period: 'annual', price_usd: 96, is_active: true },
      ];
      expect(() => pipe.transform({ prices })).not.toThrow();
    });

    it('rejects price_usd above 99999.99', () => {
      expect(() =>
        pipe.transform({ prices: [{ period: 'monthly', price_usd: 100000, is_active: true }] }),
      ).toThrow(BadRequestException);
    });

    it('accepts price_usd of exactly 99999.99', () => {
      expect(() =>
        pipe.transform({ prices: [{ period: 'monthly', price_usd: 99999.99, is_active: true }] }),
      ).not.toThrow();
    });

    it('rejects negative price_usd', () => {
      expect(() =>
        pipe.transform({ prices: [{ period: 'annual', price_usd: -1, is_active: true }] }),
      ).toThrow(BadRequestException);
    });

    it('rejects invalid period value', () => {
      expect(() =>
        pipe.transform({ prices: [{ period: 'weekly', price_usd: 5, is_active: true }] }),
      ).toThrow(BadRequestException);
    });
  });

  describe('Authorization — guard metadata', () => {
    it('controller class is decorated with @Roles("super_admin")', () => {
      // The Reflector reads guard metadata set by @Roles and @UseGuards at the class level.
      // In a real HTTP request, RolesGuard reads this metadata and returns 403 for non-super_admin users.
      // We verify the metadata is set correctly so the guard will enforce authorization.
      const reflector = module.get(Reflector);
      const roles = reflector.getAllAndOverride<string[]>('roles', [
        AdminController.prototype.dashboard,
        AdminController,
      ]);
      // @Roles('super_admin') is set at class level — getAllAndOverride returns it
      expect(roles).toContain('super_admin');
    });

    it('rejects a doctor-role request — RolesGuard throws ForbiddenException', async () => {
      // Simulate what RolesGuard does when user.role !== 'super_admin'
      const reflector = new Reflector();
      const guard = new RolesGuard(reflector);

      const mockContext = {
        getHandler: () => AdminController.prototype.dashboard,
        getClass: () => AdminController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { sub: 'uid', role: 'doctor', email: 'doc@dev.local' } }),
        }),
      };

      expect(() => guard.canActivate(mockContext as never)).toThrow(ForbiddenException);
    });

    it('allows a super_admin-role request — RolesGuard returns true', () => {
      const reflector = new Reflector();
      const guard = new RolesGuard(reflector);

      const mockContext = {
        getHandler: () => AdminController.prototype.dashboard,
        getClass: () => AdminController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { sub: 'uid', role: 'super_admin', email: 'admin@dev.local' },
          }),
        }),
      };

      expect(guard.canActivate(mockContext as never)).toBe(true);
    });
  });
});
