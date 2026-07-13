import { GetBcvRateByDateUseCase } from './get-bcv-rate-by-date.use-case';
import type { IBcvRateHistoryRepository } from '../../../domain/repositories/bcv-rate-history.repository';
import type { IBcvRateFetcher } from '../../../domain/repositories/rate-fetcher.ports';
import type { IBcvRateHistoryFetcher } from '../../../domain/repositories/bcv-rate-history-fetcher.port';

const TODAY = new Date().toISOString().slice(0, 10);
const PAST_DATE = '2026-06-15'; // within history window

describe('GetBcvRateByDateUseCase', () => {
  let useCase: GetBcvRateByDateUseCase;
  let mockHistoryRepo: jest.Mocked<IBcvRateHistoryRepository>;
  let mockHistoryFetcher: jest.Mocked<IBcvRateHistoryFetcher>;
  let mockCurrentFetcher: jest.Mocked<IBcvRateFetcher>;

  beforeEach(() => {
    mockHistoryRepo = {
      findByDate: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockHistoryFetcher = {
      fetchForDate: jest.fn(),
    };
    mockCurrentFetcher = {
      fetchRate: jest.fn(),
    };

    useCase = new GetBcvRateByDateUseCase(mockHistoryRepo, mockHistoryFetcher, mockCurrentFetcher);
  });

  describe('cache hit', () => {
    it('returns cached rate without calling external APIs', async () => {
      mockHistoryRepo.findByDate.mockResolvedValue({
        rateDate: PAST_DATE,
        rate: 36.5,
        source: 'pydolarve',
      });

      const result = await useCase.execute({ date: PAST_DATE });

      expect(result).toEqual({ rate: 36.5, date: PAST_DATE, source: 'cache' });
      expect(mockHistoryFetcher.fetchForDate).not.toHaveBeenCalled();
      expect(mockCurrentFetcher.fetchRate).not.toHaveBeenCalled();
    });
  });

  describe('cache miss — historical API available', () => {
    it('fetches from pydolarve, caches the result, and returns it', async () => {
      mockHistoryRepo.findByDate.mockResolvedValue(null);
      mockHistoryFetcher.fetchForDate.mockResolvedValue(37.2);

      const result = await useCase.execute({ date: PAST_DATE });

      expect(mockHistoryFetcher.fetchForDate).toHaveBeenCalledWith(PAST_DATE);
      expect(mockHistoryRepo.save).toHaveBeenCalledWith({
        rateDate: PAST_DATE,
        rate: 37.2,
        source: 'pydolarve',
      });
      expect(result).toEqual({ rate: 37.2, date: PAST_DATE, source: 'pydolarve' });
    });
  });

  describe('cache miss — historical API unavailable', () => {
    it('falls back to the current BCV rate when history fetch returns null', async () => {
      mockHistoryRepo.findByDate.mockResolvedValue(null);
      mockHistoryFetcher.fetchForDate.mockResolvedValue(null);
      mockCurrentFetcher.fetchRate.mockResolvedValue(38.0);

      const result = await useCase.execute({ date: PAST_DATE });

      expect(mockCurrentFetcher.fetchRate).toHaveBeenCalled();
      expect(result).toEqual({ rate: 38.0, date: PAST_DATE, source: 'current-fallback' });
    });

    it('returns rate=null with source=unavailable when all sources fail', async () => {
      mockHistoryRepo.findByDate.mockResolvedValue(null);
      mockHistoryFetcher.fetchForDate.mockResolvedValue(null);
      mockCurrentFetcher.fetchRate.mockResolvedValue(null);

      const result = await useCase.execute({ date: PAST_DATE });

      expect(result.rate).toBeNull();
      expect(result.source).toBe('unavailable');
    });

    it('does not persist to cache when history API returns null', async () => {
      mockHistoryRepo.findByDate.mockResolvedValue(null);
      mockHistoryFetcher.fetchForDate.mockResolvedValue(null);
      mockCurrentFetcher.fetchRate.mockResolvedValue(38.0);

      await useCase.execute({ date: PAST_DATE });

      expect(mockHistoryRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('today or future dates', () => {
    it('falls back to current rate when no cache exists for today', async () => {
      mockHistoryRepo.findByDate.mockResolvedValue(null);
      // History fetcher returns null for today (no historical data yet)
      mockHistoryFetcher.fetchForDate.mockResolvedValue(null);
      mockCurrentFetcher.fetchRate.mockResolvedValue(36.8);

      const result = await useCase.execute({ date: TODAY });

      expect(result.rate).toBe(36.8);
      expect(result.source).toBe('current-fallback');
    });
  });

  describe('cache is checked before any external call', () => {
    it('never calls the history fetcher when cache returns a result', async () => {
      mockHistoryRepo.findByDate.mockResolvedValue({
        rateDate: TODAY,
        rate: 35.0,
        source: 'cache',
      });

      await useCase.execute({ date: TODAY });

      expect(mockHistoryFetcher.fetchForDate).not.toHaveBeenCalled();
      expect(mockCurrentFetcher.fetchRate).not.toHaveBeenCalled();
    });
  });
});
