import { BinanceRateFetcher } from './binance-rate.fetcher';

describe('BinanceRateFetcher', () => {
  let fetcher: BinanceRateFetcher;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    fetcher = new BinanceRateFetcher();
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const makeResponse = (data: unknown[], ok = true) => ({
    ok,
    status: ok ? 200 : 500,
    json: jest.fn().mockResolvedValue({ data }),
  });

  const makeAd = (price: string) => ({ adv: { price } });

  it('returns the average of valid ad prices', async () => {
    mockFetch.mockResolvedValue(makeResponse([makeAd('36.5'), makeAd('37.5'), makeAd('38.0')]));
    const result = await fetcher.fetchRate();
    expect(result).toBeCloseTo((36.5 + 37.5 + 38.0) / 3, 5);
  });

  it('returns null when response is not ok', async () => {
    mockFetch.mockResolvedValue(makeResponse([], false));
    const result = await fetcher.fetchRate();
    expect(result).toBeNull();
  });

  it('returns null when data array is empty', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    const result = await fetcher.fetchRate();
    expect(result).toBeNull();
  });

  it('ignores ads with non-numeric prices', async () => {
    mockFetch.mockResolvedValue(makeResponse([makeAd('abc'), makeAd('36.0'), makeAd('')]));
    const result = await fetcher.fetchRate();
    expect(result).toBe(36.0);
  });

  it('returns null when all prices are non-numeric', async () => {
    mockFetch.mockResolvedValue(makeResponse([makeAd(''), makeAd('NaN'), makeAd('null')]));
    const result = await fetcher.fetchRate();
    expect(result).toBeNull();
  });

  it('returns null when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    const result = await fetcher.fetchRate();
    expect(result).toBeNull();
  });

  it('returns null when fetch is aborted (timeout)', async () => {
    mockFetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const result = await fetcher.fetchRate();
    expect(result).toBeNull();
  });

  it('returns null when data field is missing from response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    });
    const result = await fetcher.fetchRate();
    expect(result).toBeNull();
  });

  it('sends correct request body', async () => {
    mockFetch.mockResolvedValue(makeResponse([makeAd('40.0')]));
    await fetcher.fetchRate();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.asset).toBe('USDT');
    expect(body.fiat).toBe('VES');
    expect(body.tradeType).toBe('BUY');
  });
});
