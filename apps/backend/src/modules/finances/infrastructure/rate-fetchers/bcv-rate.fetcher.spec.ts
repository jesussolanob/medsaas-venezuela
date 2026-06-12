import { BcvRateFetcher } from './bcv-rate.fetcher';

describe('BcvRateFetcher', () => {
  let fetcher: BcvRateFetcher;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    fetcher = new BcvRateFetcher();
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const makePrimaryOk = (promedio: unknown) => ({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ promedio }),
  });

  const makeFallbackOk = (price: unknown) => ({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ price }),
  });

  const makeErrorResponse = () => ({
    ok: false,
    status: 500,
    json: jest.fn().mockResolvedValue({}),
  });

  it('returns promedio from primary source when valid', async () => {
    mockFetch.mockResolvedValueOnce(makePrimaryOk(36.5));
    const result = await fetcher.fetchRate();
    expect(result).toBe(36.5);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses fallback when primary returns non-ok status', async () => {
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse())
      .mockResolvedValueOnce(makeFallbackOk(37.0));
    const result = await fetcher.fetchRate();
    expect(result).toBe(37.0);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('uses fallback when primary promedio is not a number', async () => {
    mockFetch
      .mockResolvedValueOnce(makePrimaryOk('not-a-number'))
      .mockResolvedValueOnce(makeFallbackOk(38.0));
    const result = await fetcher.fetchRate();
    expect(result).toBe(38.0);
  });

  it('uses fallback when primary promedio is missing', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({}) })
      .mockResolvedValueOnce(makeFallbackOk(35.0));
    const result = await fetcher.fetchRate();
    expect(result).toBe(35.0);
  });

  it('returns null when both primary and fallback fail', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse()).mockResolvedValueOnce(makeErrorResponse());
    const result = await fetcher.fetchRate();
    expect(result).toBeNull();
  });

  it('returns null when primary throws', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(makeErrorResponse());
    const result = await fetcher.fetchRate();
    expect(result).toBeNull();
  });

  it('returns null when both throw', async () => {
    mockFetch.mockRejectedValueOnce(new Error('err1')).mockRejectedValueOnce(new Error('err2'));
    const result = await fetcher.fetchRate();
    expect(result).toBeNull();
  });

  it('returns null when primary promedio is zero or negative', async () => {
    mockFetch.mockResolvedValueOnce(makePrimaryOk(0)).mockResolvedValueOnce(makeErrorResponse());
    const result = await fetcher.fetchRate();
    expect(result).toBeNull();
  });

  it('returns null when fallback price is zero or negative', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse()).mockResolvedValueOnce(makeFallbackOk(-5));
    const result = await fetcher.fetchRate();
    expect(result).toBeNull();
  });

  it('calls primary URL first', async () => {
    mockFetch.mockResolvedValueOnce(makePrimaryOk(36.5));
    await fetcher.fetchRate();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('dolarapi.com');
  });

  it('calls fallback URL when primary fails', async () => {
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse())
      .mockResolvedValueOnce(makeFallbackOk(36.0));
    await fetcher.fetchRate();
    const [fallbackUrl] = mockFetch.mock.calls[1] as [string];
    expect(fallbackUrl).toContain('pydolarve.org');
  });
});
