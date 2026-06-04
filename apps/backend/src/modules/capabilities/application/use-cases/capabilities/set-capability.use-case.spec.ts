import { SetCapabilityUseCase } from './set-capability.use-case';
import type { IRoleCapabilityRepository } from '../../../domain/repositories/role-capability.repository';
import { RoleCapability } from '../../../domain/entities/role-capability.entity';

const makeRow = (overrides: Partial<ConstructorParameters<typeof RoleCapability>[0]> = {}) =>
  new RoleCapability({
    id: 'uuid-1',
    role: 'doctor',
    moduleKey: 'finances',
    action: 'view',
    allowed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

const mockRepo = (): jest.Mocked<IRoleCapabilityRepository> => ({
  findByRole: jest.fn(),
  findAll: jest.fn(),
  upsert: jest.fn(),
});

const makeRedis = (overrides: Partial<Record<string, jest.Mock>> = {}) => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  ...overrides,
});

describe('SetCapabilityUseCase', () => {
  let useCase: SetCapabilityUseCase;
  let repo: jest.Mocked<IRoleCapabilityRepository>;
  let redis: ReturnType<typeof makeRedis>;

  beforeEach(() => {
    repo = mockRepo();
    redis = makeRedis();
    useCase = new SetCapabilityUseCase(repo, redis as never);
  });

  it('calls upsert with correct parameters', async () => {
    repo.upsert.mockResolvedValue(makeRow());

    await useCase.execute({
      role: 'doctor',
      moduleKey: 'finances',
      action: 'view',
      allowed: false,
    });

    expect(repo.upsert).toHaveBeenCalledWith('doctor', 'finances', 'view', false);
  });

  it('returns the saved entity', async () => {
    const saved = makeRow({ allowed: false });
    repo.upsert.mockResolvedValue(saved);

    const result = await useCase.execute({
      role: 'doctor',
      moduleKey: 'finances',
      action: 'view',
      allowed: false,
    });

    expect(result).toBe(saved);
  });

  it('deletes Redis cache key for the affected role', async () => {
    repo.upsert.mockResolvedValue(makeRow());

    await useCase.execute({
      role: 'doctor',
      moduleKey: 'finances',
      action: 'view',
      allowed: false,
    });

    expect(redis.del).toHaveBeenCalledWith('capabilities:doctor');
  });

  it('does not throw when Redis del fails (best-effort invalidation)', async () => {
    repo.upsert.mockResolvedValue(makeRow());
    redis.del.mockRejectedValue(new Error('Redis connection refused'));

    await expect(
      useCase.execute({ role: 'doctor', moduleKey: 'finances', action: 'view', allowed: false }),
    ).resolves.not.toThrow();
  });

  it('still returns saved row when Redis del fails', async () => {
    const saved = makeRow({ allowed: true });
    repo.upsert.mockResolvedValue(saved);
    redis.del.mockRejectedValue(new Error('Redis down'));

    const result = await useCase.execute({
      role: 'doctor',
      moduleKey: 'billing',
      action: 'create',
      allowed: true,
    });

    expect(result).toBe(saved);
  });
});
