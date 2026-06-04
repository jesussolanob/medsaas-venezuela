import { ResolveCapabilitiesUseCase } from './resolve-capabilities.use-case';
import type { IRoleCapabilityRepository } from '../../../domain/repositories/role-capability.repository';
import { RoleCapability } from '../../../domain/entities/role-capability.entity';

const makeRow = (
  moduleKey: string,
  action: 'view' | 'create' | 'edit' | 'delete',
  allowed = true,
) =>
  new RoleCapability({
    id: `id-${moduleKey}-${action}`,
    role: 'doctor',
    moduleKey,
    action,
    allowed,
    createdAt: new Date(),
    updatedAt: new Date(),
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

describe('ResolveCapabilitiesUseCase', () => {
  let useCase: ResolveCapabilitiesUseCase;
  let repo: jest.Mocked<IRoleCapabilityRepository>;
  let redis: ReturnType<typeof makeRedis>;

  beforeEach(() => {
    repo = mockRepo();
    redis = makeRedis();
    useCase = new ResolveCapabilitiesUseCase(repo, redis as never);
  });

  it('returns capability map built from DB rows on cache miss', async () => {
    repo.findByRole.mockResolvedValue([
      makeRow('agenda', 'view'),
      makeRow('patients', 'view'),
      makeRow('patients', 'create'),
    ]);

    const result = await useCase.execute('doctor');

    expect(result.role).toBe('doctor');
    expect(result.modules['agenda']).toEqual({
      view: true,
      create: false,
      edit: false,
      delete: false,
    });
    expect(result.modules['patients']!.view).toBe(true);
    expect(result.modules['patients']!.create).toBe(true);
    expect(result.modules['patients']!.edit).toBe(false);
    expect(result.modules['patients']!.delete).toBe(false);
  });

  it('returns cached map when Redis has a valid value', async () => {
    const cached = { agenda: { view: true, create: false, edit: false, delete: false } };
    redis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await useCase.execute('doctor');

    expect(result.modules).toEqual(cached);
    // Repo should NOT have been called — served from cache
    expect(repo.findByRole).not.toHaveBeenCalled();
  });

  it('populates cache after DB read', async () => {
    repo.findByRole.mockResolvedValue([makeRow('billing', 'view')]);

    await useCase.execute('doctor');

    expect(redis.set).toHaveBeenCalledWith('capabilities:doctor', expect.any(String), 'EX', 300);
  });

  it('falls back to DB when Redis get throws', async () => {
    redis.get.mockRejectedValue(new Error('Redis down'));
    repo.findByRole.mockResolvedValue([makeRow('agenda', 'view')]);

    const result = await useCase.execute('doctor');

    expect(result.modules['agenda']!.view).toBe(true);
    expect(repo.findByRole).toHaveBeenCalledWith('doctor');
  });

  it('does not throw when Redis set fails (cache write degradation)', async () => {
    redis.get.mockResolvedValue(null);
    redis.set.mockRejectedValue(new Error('Redis write error'));
    repo.findByRole.mockResolvedValue([makeRow('agenda', 'view')]);

    await expect(useCase.execute('doctor')).resolves.not.toThrow();
  });

  it('applies default-deny: missing actions default to false', async () => {
    repo.findByRole.mockResolvedValue([makeRow('patients', 'view')]);

    const result = await useCase.execute('doctor');

    expect(result.modules['patients']!.view).toBe(true);
    expect(result.modules['patients']!.create).toBe(false);
    expect(result.modules['patients']!.edit).toBe(false);
    expect(result.modules['patients']!.delete).toBe(false);
  });

  it('returns empty modules when role has no capabilities in DB', async () => {
    repo.findByRole.mockResolvedValue([]);

    const result = await useCase.execute('unknown_role');

    expect(result.modules).toEqual({});
  });

  it('reflects allowed=false rows correctly', async () => {
    repo.findByRole.mockResolvedValue([makeRow('finances', 'view', false)]);

    const result = await useCase.execute('doctor');

    expect(result.modules['finances']!.view).toBe(false);
  });
});
