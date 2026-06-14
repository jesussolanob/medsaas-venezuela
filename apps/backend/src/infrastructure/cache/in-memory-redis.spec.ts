import { InMemoryRedis } from './in-memory-redis';

describe('InMemoryRedis', () => {
  let redis: InMemoryRedis;

  beforeEach(() => {
    redis = new InMemoryRedis();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null for a missing key', async () => {
    expect(await redis.get('nope')).toBeNull();
  });

  it('stores and reads a value (set without TTL)', async () => {
    await redis.set('k', 'v');
    expect(await redis.get('k')).toBe('v');
  });

  it('setex stores a value readable before expiry', async () => {
    const ok = await redis.setex('k', 300, 'v');
    expect(ok).toBe('OK');
    expect(await redis.get('k')).toBe('v');
  });

  it('expires a key after its EX ttl elapses', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-14T00:00:00Z'));

    await redis.set('k', 'v', 'EX', 60);
    expect(await redis.get('k')).toBe('v');

    jest.setSystemTime(new Date('2026-06-14T00:01:01Z')); // +61s
    expect(await redis.get('k')).toBeNull();
  });

  it('del removes keys and returns the count removed', async () => {
    await redis.set('a', '1');
    await redis.set('b', '2');
    expect(await redis.del('a', 'b', 'missing')).toBe(2);
    expect(await redis.get('a')).toBeNull();
  });

  it('scan returns matching keys with a terminal cursor', async () => {
    await redis.set('capabilities:doctor', '{}');
    await redis.set('capabilities:admin', '{}');
    await redis.set('other:key', '{}');

    const [cursor, keys] = await redis.scan(0, 'MATCH', 'capabilities:*', 'COUNT', 100);

    expect(cursor).toBe('0');
    expect(keys.sort()).toEqual(['capabilities:admin', 'capabilities:doctor']);
  });

  it('ping returns PONG', async () => {
    expect(await redis.ping()).toBe('PONG');
  });
});
