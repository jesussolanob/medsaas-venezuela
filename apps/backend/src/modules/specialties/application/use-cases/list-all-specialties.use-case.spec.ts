import { ListAllSpecialtiesUseCase } from './list-all-specialties.use-case';
import type { ISpecialtyRepository } from '../../domain/repositories/specialty.repository';
import { Specialty } from '../../domain/entities/specialty.entity';

function makeSpecialty(
  overrides: Partial<Parameters<typeof Specialty.reconstitute>[0]> = {},
): Specialty {
  return Specialty.reconstitute({
    id: 'aaaa0000-0000-0000-0000-000000000001',
    name: 'Cardiología',
    isActive: true,
    sortOrder: 20,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

describe('ListAllSpecialtiesUseCase', () => {
  let useCase: ListAllSpecialtiesUseCase;
  let mockRepo: jest.Mocked<ISpecialtyRepository>;

  beforeEach(() => {
    mockRepo = {
      findAll: jest.fn(),
      findAllActive: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    useCase = new ListAllSpecialtiesUseCase(mockRepo);
  });

  it('delegates to repo.findAll and returns the result', async () => {
    const active = makeSpecialty({
      id: 'id-1',
      name: 'Cardiología',
      isActive: true,
      sortOrder: 20,
    });
    const inactive = makeSpecialty({
      id: 'id-2',
      name: 'Homeopatía',
      isActive: false,
      sortOrder: 900,
    });
    mockRepo.findAll.mockResolvedValue([active, inactive]);

    const result = await useCase.execute();

    expect(mockRepo.findAll).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('Cardiología');
    expect(result[0]?.isActive).toBe(true);
    expect(result[1]?.name).toBe('Homeopatía');
    expect(result[1]?.isActive).toBe(false);
  });

  it('returns both active and inactive specialties', async () => {
    const specialties = [
      makeSpecialty({ id: 'id-1', name: 'A', isActive: true, sortOrder: 10 }),
      makeSpecialty({ id: 'id-2', name: 'B', isActive: false, sortOrder: 20 }),
      makeSpecialty({ id: 'id-3', name: 'C', isActive: true, sortOrder: 30 }),
    ];
    mockRepo.findAll.mockResolvedValue(specialties);

    const result = await useCase.execute();

    expect(result).toHaveLength(3);
    const activeCount = result.filter((s) => s.isActive).length;
    const inactiveCount = result.filter((s) => !s.isActive).length;
    expect(activeCount).toBe(2);
    expect(inactiveCount).toBe(1);
  });

  it('returns an empty array when no specialties exist', async () => {
    mockRepo.findAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });

  it('does not call findAllActive', async () => {
    mockRepo.findAll.mockResolvedValue([]);

    await useCase.execute();

    expect(mockRepo.findAllActive).not.toHaveBeenCalled();
  });

  it('propagates repository errors', async () => {
    mockRepo.findAll.mockRejectedValue(new Error('DB unavailable'));

    await expect(useCase.execute()).rejects.toThrow('DB unavailable');
  });
});
