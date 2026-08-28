import { Test, type TestingModule } from '@nestjs/testing';
import { PlansCatalogController } from './plans-catalog.controller';
import { GetPublicPlanCatalogUseCase } from '../../application/use-cases/admin/get-public-plan-catalog.use-case';
import type { PublicPlanCatalogItem } from '../../application/use-cases/admin/get-public-plan-catalog.use-case';

const sampleCatalog: PublicPlanCatalogItem[] = [
  {
    plan_key: 'delta_free',
    name: 'Delta Free',
    is_permanent: true,
    sort_order: 1,
    prices: [],
    features: [{ feature_key: 'patients', feature_label: 'Pacientes', enabled: true }],
  },
  {
    plan_key: 'delta_base',
    name: 'Delta Base',
    is_permanent: false,
    sort_order: 2,
    prices: [{ period: 'monthly', price_usd: 29, compare_at_price: null }],
    features: [],
  },
];

describe('PlansCatalogController', () => {
  let controller: PlansCatalogController;
  let mockUseCase: jest.Mocked<GetPublicPlanCatalogUseCase>;

  beforeEach(async () => {
    mockUseCase = { execute: jest.fn() } as unknown as jest.Mocked<GetPublicPlanCatalogUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlansCatalogController],
      providers: [{ provide: GetPublicPlanCatalogUseCase, useValue: mockUseCase }],
    }).compile();

    controller = module.get<PlansCatalogController>(PlansCatalogController);
  });

  it('returns success envelope with catalog data', async () => {
    mockUseCase.execute.mockResolvedValue(sampleCatalog);

    const result = await controller.listCatalog('doctor');

    expect(result).toEqual({ success: true, data: sampleCatalog });
    expect(mockUseCase.execute).toHaveBeenCalledWith({ role: 'doctor' });
  });

  it('passes undefined role to use case when query param absent', async () => {
    mockUseCase.execute.mockResolvedValue([]);

    const result = await controller.listCatalog(undefined);

    expect(result).toEqual({ success: true, data: [] });
    expect(mockUseCase.execute).toHaveBeenCalledWith({ role: undefined });
  });

  it('delegates role query param to use case as-is', async () => {
    mockUseCase.execute.mockResolvedValue([]);

    await controller.listCatalog('admin');

    expect(mockUseCase.execute).toHaveBeenCalledWith({ role: 'admin' });
  });

  it('returns empty array when no active plans exist', async () => {
    mockUseCase.execute.mockResolvedValue([]);

    const result = await controller.listCatalog();

    expect(result).toEqual({ success: true, data: [] });
  });

  it('has no guards attached (public endpoint)', () => {
    // Verify that the controller class has no UseGuards metadata
    // (NestJS stores guards metadata under the GUARDS_METADATA key)
    const guardsMeta = Reflect.getMetadata('__guards__', PlansCatalogController);
    expect(guardsMeta).toBeUndefined();
  });
});
