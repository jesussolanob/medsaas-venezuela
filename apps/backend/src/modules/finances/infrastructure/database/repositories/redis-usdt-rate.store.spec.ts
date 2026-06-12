import { RedisUsdtRateStore } from './redis-usdt-rate.store';
import type {
  IBinanceRateFetcher,
  IBcvRateFetcher,
} from '../../../domain/repositories/rate-fetcher.ports';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRedis(overrides: Partial<{ get: jest.Mock; setex: jest.Mock }> = {}) {
  return {
    get: overrides.get ?? jest.fn().mockResolvedValue(null),
    setex: overrides.setex ?? jest.fn().mockResolvedValue('OK'),
  };
}

function makeSettingModel(rows: Record<string, string> = {}) {
  const store: Record<string, string> = { ...rows };
  return {
    findByPk: jest.fn((key: string) =>
      Promise.resolve(store[key] != null ? { value: store[key] } : null),
    ),
    upsert: jest.fn((data: { key: string; value: string }) => {
      store[data.key] = data.value;
      return Promise.resolve([{ key: data.key, value: data.value }, true]);
    }),
    _store: store,
  };
}

function makeBinanceFetcher(rate: number | null): jest.Mocked<IBinanceRateFetcher> {
  return { fetchRate: jest.fn().mockResolvedValue(rate) };
}

function makeBcvFetcher(rate: number | null): jest.Mocked<IBcvRateFetcher> {
  return { fetchRate: jest.fn().mockResolvedValue(rate) };
}

function makeStore(opts: {
  redis?: ReturnType<typeof makeRedis>;
  settings?: Record<string, string>;
  binanceRate?: number | null;
  bcvRate?: number | null;
}) {
  const redis = opts.redis ?? makeRedis();
  const settingModel = makeSettingModel(opts.settings ?? {});
  const binanceFetcher = makeBinanceFetcher(opts.binanceRate ?? null);
  const bcvFetcher = makeBcvFetcher(opts.bcvRate ?? null);

  const store = new RedisUsdtRateStore(
    redis as never,
    settingModel as never,
    binanceFetcher,
    bcvFetcher,
  );

  return { store, redis, settingModel, binanceFetcher, bcvFetcher };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RedisUsdtRateStore', () => {
  // (a) source=binance, Redis hit — returns cached value immediately
  describe('getRate() — source=binance, Redis hit', () => {
    it('returns cached Redis value without calling fetcher', async () => {
      const { store, binanceFetcher } = makeStore({
        redis: makeRedis({ get: jest.fn().mockResolvedValue('36.5') }),
        settings: { rate_source: 'binance' },
        binanceRate: 99,
      });

      const rate = await store.getRate();

      expect(rate).toBe(36.5);
      expect(binanceFetcher.fetchRate).not.toHaveBeenCalled();
    });
  });

  // (b) source=binance, Redis miss → fetch ok → persists and returns
  describe('getRate() — source=binance, Redis miss, fetch succeeds', () => {
    it('calls fetcher, persists result, and returns the fetched rate', async () => {
      const { store, settingModel, redis, binanceFetcher } = makeStore({
        settings: { rate_source: 'binance' },
        binanceRate: 40.0,
      });

      const rate = await store.getRate();

      expect(rate).toBe(40.0);
      expect(binanceFetcher.fetchRate).toHaveBeenCalledTimes(1);
      // Persisted in Redis
      expect(redis.setex).toHaveBeenCalledWith('usdt_rate', 600, '40');
      // Persisted in app_settings (usdt_rate + usdt_binance_rate)
      const upsertCalls = settingModel.upsert.mock.calls as Array<[{ key: string; value: string }]>;
      const effectiveCall = upsertCalls.find(([c]) => c.key === 'usdt_rate');
      const binanceCall = upsertCalls.find(([c]) => c.key === 'usdt_binance_rate');
      expect(effectiveCall).toBeDefined();
      expect(binanceCall).toBeDefined();
    });
  });

  // (c) source=binance, Redis miss → fetch fails → fallback to app_settings
  describe('getRate() — source=binance, Redis miss, fetch fails', () => {
    it('falls back to last-known app_settings usdt_rate', async () => {
      const { store, binanceFetcher, bcvFetcher } = makeStore({
        settings: { rate_source: 'binance', usdt_rate: '35.0' },
        binanceRate: null,
        bcvRate: null,
      });

      const rate = await store.getRate();

      expect(rate).toBe(35.0);
      expect(binanceFetcher.fetchRate).toHaveBeenCalledTimes(1);
      // Also tried the other source (bcv)
      expect(bcvFetcher.fetchRate).toHaveBeenCalledTimes(1);
    });

    it('tries other source before falling back', async () => {
      const { store, binanceFetcher, bcvFetcher } = makeStore({
        settings: { rate_source: 'binance' },
        binanceRate: null,
        bcvRate: 38.5,
      });

      const rate = await store.getRate();

      expect(rate).toBe(38.5);
      expect(binanceFetcher.fetchRate).toHaveBeenCalledTimes(1);
      expect(bcvFetcher.fetchRate).toHaveBeenCalledTimes(1);
    });

    it('returns null when both sources fail and no last-known rate exists', async () => {
      const { store } = makeStore({
        settings: { rate_source: 'binance' },
        binanceRate: null,
        bcvRate: null,
      });

      const rate = await store.getRate();

      expect(rate).toBeNull();
    });
  });

  // (d) source=manual — returns manual rate from Redis/app_settings
  describe('getRate() — source=manual', () => {
    it('returns Redis cached rate without fetching', async () => {
      const { store, binanceFetcher, bcvFetcher } = makeStore({
        redis: makeRedis({ get: jest.fn().mockResolvedValue('42.0') }),
        settings: { rate_source: 'manual' },
        binanceRate: 99,
        bcvRate: 99,
      });

      const rate = await store.getRate();

      expect(rate).toBe(42.0);
      expect(binanceFetcher.fetchRate).not.toHaveBeenCalled();
      expect(bcvFetcher.fetchRate).not.toHaveBeenCalled();
    });

    it('falls back to app_settings when Redis misses', async () => {
      const { store, redis } = makeStore({
        settings: { rate_source: 'manual', usdt_rate: '45.0' },
      });

      const rate = await store.getRate();

      expect(rate).toBe(45.0);
      // Should warm Redis cache after reading from settings
      expect(redis.setex).toHaveBeenCalledWith('usdt_rate', 600, '45');
    });

    it('returns null when no manual rate is configured', async () => {
      const { store } = makeStore({ settings: { rate_source: 'manual' } });
      const rate = await store.getRate();
      expect(rate).toBeNull();
    });
  });

  // (e) setSource changes source and triggers immediate fetch
  describe('setSource()', () => {
    it('switches to binance, fetches immediately, and persists', async () => {
      const { store, settingModel, binanceFetcher } = makeStore({
        settings: { rate_source: 'manual', usdt_rate: '30.0' },
        binanceRate: 41.0,
      });

      const rate = await store.setSource('binance');

      expect(rate).toBe(41.0);
      expect(binanceFetcher.fetchRate).toHaveBeenCalledTimes(1);

      const upsertCalls = settingModel.upsert.mock.calls as Array<[{ key: string; value: string }]>;
      const sourceCall = upsertCalls.find(([c]) => c.key === 'rate_source');
      expect(sourceCall?.[0].value).toBe('binance');
    });

    it('switches to bcv, fetches immediately, and persists', async () => {
      const { store, bcvFetcher } = makeStore({
        settings: { rate_source: 'manual' },
        bcvRate: 39.5,
      });

      const rate = await store.setSource('bcv');

      expect(rate).toBe(39.5);
      expect(bcvFetcher.fetchRate).toHaveBeenCalledTimes(1);
    });

    it('switches to manual with provided value', async () => {
      const { store, settingModel } = makeStore({});

      const rate = await store.setSource('manual', 50.0);

      expect(rate).toBe(50.0);
      const upsertCalls = settingModel.upsert.mock.calls as Array<[{ key: string; value: string }]>;
      const sourceCall = upsertCalls.find(([c]) => c.key === 'rate_source');
      expect(sourceCall?.[0].value).toBe('manual');
    });

    it('returns last-known rate when immediate fetch fails on source switch', async () => {
      const { store } = makeStore({
        settings: { rate_source: 'manual', usdt_rate: '33.0' },
        binanceRate: null,
      });

      const rate = await store.setSource('binance');

      expect(rate).toBe(33.0);
    });
  });

  // (f) getRatesSummary
  describe('getRatesSummary()', () => {
    it('returns the full rates summary', async () => {
      const { store } = makeStore({
        settings: {
          rate_source: 'binance',
          usdt_rate: '40.0',
          usdt_binance_rate: '40.0',
          usdt_bcv_rate: '38.5',
        },
      });

      const summary = await store.getRatesSummary();

      expect(summary.source).toBe('binance');
      expect(summary.effective).toBe(40.0);
      expect(summary.binance).toBe(40.0);
      expect(summary.bcv).toBe(38.5);
      // manual is null when source != 'manual'
      expect(summary.manual).toBeNull();
    });

    it('populates manual when source=manual', async () => {
      const { store } = makeStore({
        settings: {
          rate_source: 'manual',
          usdt_rate: '55.0',
        },
      });

      const summary = await store.getRatesSummary();

      expect(summary.source).toBe('manual');
      expect(summary.manual).toBe(55.0);
    });

    it('defaults source to binance when rate_source is not set', async () => {
      const { store } = makeStore({ settings: {} });

      const summary = await store.getRatesSummary();

      expect(summary.source).toBe('binance');
    });
  });

  // setRate backward compatibility
  describe('setRate()', () => {
    it('sets rate_source to manual and persists the rate', async () => {
      const { store, settingModel, redis } = makeStore({});

      await store.setRate(36.5);

      const upsertCalls = settingModel.upsert.mock.calls as Array<[{ key: string; value: string }]>;
      const sourceCall = upsertCalls.find(([c]) => c.key === 'rate_source');
      const effectiveCall = upsertCalls.find(([c]) => c.key === 'usdt_rate');
      expect(sourceCall?.[0].value).toBe('manual');
      expect(effectiveCall?.[0].value).toBe('36.5');
      expect(redis.setex).toHaveBeenCalledWith('usdt_rate', 600, '36.5');
    });
  });
});
