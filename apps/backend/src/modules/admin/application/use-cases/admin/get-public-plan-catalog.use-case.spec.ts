import { GetPublicPlanCatalogUseCase } from './get-public-plan-catalog.use-case';
import type { IAdminRepository, PlanDetail } from '../../../domain/repositories/admin.repository';

const makePlan = (overrides: Partial<PlanDetail> = {}): PlanDetail => ({
  planKey: 'delta_free',
  name: 'Delta Free',
  priceUsd: 0,
  trialDays: 0,
  isActive: true,
  description: null,
  sortOrder: 1,
  roleKey: 'doctor',
  isPermanent: true,
  prices: [],
  features: [],
  ...overrides,
});

describe('GetPublicPlanCatalogUseCase', () => {
  let useCase: GetPublicPlanCatalogUseCase;
  let mockRepo: jest.Mocked<Pick<IAdminRepository, 'listPlansWithDetails'>>;

  beforeEach(() => {
    mockRepo = { listPlansWithDetails: jest.fn() };
    useCase = new GetPublicPlanCatalogUseCase(mockRepo as unknown as IAdminRepository);
  });

  it('returns only active doctor plans sorted by sort_order', async () => {
    mockRepo.listPlansWithDetails.mockResolvedValue([
      makePlan({ planKey: 'delta_plus', name: 'Delta Plus', sortOrder: 3, isActive: true }),
      makePlan({ planKey: 'delta_free', name: 'Delta Free', sortOrder: 1, isActive: true }),
      makePlan({ planKey: 'delta_base', name: 'Delta Base', sortOrder: 2, isActive: true }),
      makePlan({ planKey: 'delta_inactive', isActive: false, sortOrder: 0 }),
    ]);

    const result = await useCase.execute({ role: 'doctor' });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.plan_key)).toEqual(['delta_free', 'delta_base', 'delta_plus']);
  });

  it('excludes inactive plans', async () => {
    mockRepo.listPlansWithDetails.mockResolvedValue([
      makePlan({ planKey: 'active_plan', isActive: true }),
      makePlan({ planKey: 'inactive_plan', isActive: false }),
    ]);

    const result = await useCase.execute({});
    expect(result).toHaveLength(1);
    expect(result.map((r) => r.plan_key)).toEqual(['active_plan']);
  });

  it('excludes plans for other role_key', async () => {
    mockRepo.listPlansWithDetails.mockResolvedValue([
      makePlan({ planKey: 'doctor_plan', roleKey: 'doctor', isActive: true }),
      makePlan({ planKey: 'admin_plan', roleKey: 'admin', isActive: true }),
    ]);

    const result = await useCase.execute({ role: 'doctor' });
    expect(result).toHaveLength(1);
    expect(result.map((r) => r.plan_key)).toEqual(['doctor_plan']);
  });

  it('defaults to doctor role when no role provided', async () => {
    mockRepo.listPlansWithDetails.mockResolvedValue([
      makePlan({ planKey: 'doctor_plan', roleKey: 'doctor', isActive: true }),
      makePlan({ planKey: 'admin_plan', roleKey: 'admin', isActive: true }),
    ]);

    const result = await useCase.execute({});
    expect(result).toHaveLength(1);
    expect(result.map((r) => r.plan_key)).toEqual(['doctor_plan']);
  });

  it('defaults to doctor role for invalid role value', async () => {
    mockRepo.listPlansWithDetails.mockResolvedValue([
      makePlan({ planKey: 'doctor_plan', roleKey: 'doctor', isActive: true }),
    ]);

    const result = await useCase.execute({ role: 'INVALID_ROLE' });
    expect(result).toHaveLength(1);
    expect(result.map((r) => r.plan_key)).toEqual(['doctor_plan']);
  });

  it('maps prices to snake_case and excludes inactive prices', async () => {
    mockRepo.listPlansWithDetails.mockResolvedValue([
      makePlan({
        prices: [
          { id: '1', planKey: 'delta_free', period: 'monthly', priceUsd: 29, isActive: true },
          { id: '2', planKey: 'delta_free', period: 'annual', priceUsd: 290, isActive: true },
          { id: '3', planKey: 'delta_free', period: 'quarterly', priceUsd: 80, isActive: false },
        ],
      }),
    ]);

    const result = await useCase.execute({});
    expect(result).toHaveLength(1);
    const [plan] = result;
    expect(plan).toBeDefined();
    expect(plan!.prices).toHaveLength(2);
    expect(plan!.prices).toEqual([
      { period: 'monthly', price_usd: 29 },
      { period: 'annual', price_usd: 290 },
    ]);
  });

  it('maps features to snake_case preserving enabled flag', async () => {
    mockRepo.listPlansWithDetails.mockResolvedValue([
      makePlan({
        features: [
          {
            id: '1',
            plan: 'delta_free',
            featureKey: 'telemedicine',
            featureLabel: 'Telemedicina',
            enabled: true,
          },
          {
            id: '2',
            plan: 'delta_free',
            featureKey: 'reports',
            featureLabel: 'Reportes',
            enabled: false,
          },
        ],
      }),
    ]);

    const result = await useCase.execute({});
    expect(result).toHaveLength(1);
    const [plan] = result;
    expect(plan).toBeDefined();
    expect(plan!.features).toHaveLength(2);
    expect(plan!.features).toEqual([
      { feature_key: 'telemedicine', feature_label: 'Telemedicina', enabled: true },
      { feature_key: 'reports', feature_label: 'Reportes', enabled: false },
    ]);
  });

  it('returns empty array when no active plans match', async () => {
    mockRepo.listPlansWithDetails.mockResolvedValue([makePlan({ isActive: false })]);

    const result = await useCase.execute({});
    expect(result).toEqual([]);
  });

  it('does NOT expose is_active or internal ids in output', async () => {
    mockRepo.listPlansWithDetails.mockResolvedValue([makePlan()]);

    const result = await useCase.execute({});
    expect(result).toHaveLength(1);
    const item = result[0] as unknown as Record<string, unknown>;

    expect(item).not.toHaveProperty('is_active');
    expect(item).not.toHaveProperty('isActive');
    expect(item).not.toHaveProperty('priceUsd');
    expect(item).not.toHaveProperty('price_usd');
    expect(item).not.toHaveProperty('trialDays');
    expect(item).not.toHaveProperty('trial_days');
    expect(item).not.toHaveProperty('roleKey');
    expect(item).not.toHaveProperty('role_key');
  });
});
