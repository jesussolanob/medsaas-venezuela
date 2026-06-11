import { ListPlansWithDetailsUseCase } from './list-plans-with-details.use-case';
import type { IAdminRepository, PlanDetail } from '../../../domain/repositories/admin.repository';

describe('ListPlansWithDetailsUseCase', () => {
  let useCase: ListPlansWithDetailsUseCase;
  let mockRepo: jest.Mocked<Pick<IAdminRepository, 'listPlansWithDetails'>>;

  beforeEach(() => {
    mockRepo = { listPlansWithDetails: jest.fn() };
    useCase = new ListPlansWithDetailsUseCase(mockRepo as unknown as IAdminRepository);
  });

  it('returns the list from the repository', async () => {
    const expected: PlanDetail[] = [
      {
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
      },
    ];
    mockRepo.listPlansWithDetails.mockResolvedValue(expected);

    const result = await useCase.execute();
    expect(result).toBe(expected);
    expect(mockRepo.listPlansWithDetails).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no plans exist', async () => {
    mockRepo.listPlansWithDetails.mockResolvedValue([]);
    const result = await useCase.execute();
    expect(result).toEqual([]);
  });
});
