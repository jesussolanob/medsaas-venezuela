import { ListAllCapabilitiesUseCase } from './list-all-capabilities.use-case';
import type { IRoleCapabilityRepository } from '../../../domain/repositories/role-capability.repository';
import { RoleCapability } from '../../../domain/entities/role-capability.entity';

const makeRow = (role: string, moduleKey: string, action: 'view' | 'create' | 'edit' | 'delete') =>
  new RoleCapability({
    id: `id-${role}-${moduleKey}-${action}`,
    role,
    moduleKey,
    action,
    allowed: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const mockRepo = (): jest.Mocked<IRoleCapabilityRepository> => ({
  findByRole: jest.fn(),
  findAll: jest.fn(),
  upsert: jest.fn(),
});

describe('ListAllCapabilitiesUseCase', () => {
  let useCase: ListAllCapabilitiesUseCase;
  let repo: jest.Mocked<IRoleCapabilityRepository>;

  beforeEach(() => {
    repo = mockRepo();
    useCase = new ListAllCapabilitiesUseCase(repo);
  });

  it('returns empty object when no rows exist', async () => {
    repo.findAll.mockResolvedValue([]);
    const result = await useCase.execute();
    expect(result).toEqual({});
  });

  it('groups rows by role', async () => {
    repo.findAll.mockResolvedValue([
      makeRow('doctor', 'agenda', 'view'),
      makeRow('doctor', 'patients', 'view'),
      makeRow('patient', 'appointments', 'view'),
    ]);

    const result = await useCase.execute();

    expect(Object.keys(result)).toHaveLength(2);
    expect(result['doctor']).toHaveLength(2);
    expect(result['patient']).toHaveLength(1);
  });

  it('each group contains the correct entities', async () => {
    const row = makeRow('doctor', 'billing', 'create');
    repo.findAll.mockResolvedValue([row]);

    const result = await useCase.execute();

    expect(result['doctor']![0]).toBe(row);
  });

  it('handles many rows across many roles', async () => {
    const rows = [
      makeRow('super_admin', 'dashboard', 'view'),
      makeRow('super_admin', 'doctors', 'create'),
      makeRow('admin', 'dashboard', 'view'),
      makeRow('doctor', 'agenda', 'view'),
      makeRow('patient', 'profile', 'edit'),
    ];
    repo.findAll.mockResolvedValue(rows);

    const result = await useCase.execute();

    expect(result['super_admin']).toHaveLength(2);
    expect(result['admin']).toHaveLength(1);
    expect(result['doctor']).toHaveLength(1);
    expect(result['patient']).toHaveLength(1);
  });
});
