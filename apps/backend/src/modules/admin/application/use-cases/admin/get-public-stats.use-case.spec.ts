import { GetPublicStatsUseCase } from './get-public-stats.use-case';
import type { IAdminRepository, PublicStats } from '../../../domain/repositories/admin.repository';

const makeRepo = (stats: PublicStats): jest.Mocked<IAdminRepository> =>
  ({
    getPublicStats: jest.fn().mockResolvedValue(stats),
  }) as unknown as jest.Mocked<IAdminRepository>;

describe('GetPublicStatsUseCase', () => {
  it('returns specialists and patients counts', async () => {
    const useCase = new GetPublicStatsUseCase(makeRepo({ specialists: 42, patients: 500 }));
    const result = await useCase.execute();
    expect(result).toEqual({ specialists: 42, patients: 500 });
  });

  it('returns zero counts when no data', async () => {
    const useCase = new GetPublicStatsUseCase(makeRepo({ specialists: 0, patients: 0 }));
    const result = await useCase.execute();
    expect(result.specialists).toBe(0);
    expect(result.patients).toBe(0);
  });

  it('delegates to repository exactly once', async () => {
    const repo = makeRepo({ specialists: 10, patients: 200 });
    const useCase = new GetPublicStatsUseCase(repo);
    await useCase.execute();
    expect(repo.getPublicStats).toHaveBeenCalledTimes(1);
  });
});
