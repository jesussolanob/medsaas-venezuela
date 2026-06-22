import { ListActiveSpecialtiesUseCase } from './list-active-specialties.use-case';
import type { ISpecialtyRepository } from '../../domain/repositories/specialty.repository';
import { Specialty } from '../../domain/entities/specialty.entity';

function makeSpecialty(overrides = {}): Specialty {
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

describe('ListActiveSpecialtiesUseCase', () => {
  let useCase: ListActiveSpecialtiesUseCase;
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
    useCase = new ListActiveSpecialtiesUseCase(mockRepo);
  });

  it('returns active specialties from the repository', async () => {
    const s1 = makeSpecialty({ id: 'id-1', name: 'Cardiología', sortOrder: 20 });
    const s2 = makeSpecialty({ id: 'id-2', name: 'Neurología', sortOrder: 120 });
    mockRepo.findAllActive.mockResolvedValue([s1, s2]);

    const result = await useCase.execute();

    expect(mockRepo.findAllActive).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('Cardiología');
    expect(result[1]?.name).toBe('Neurología');
  });

  it('returns an empty array when no active specialties exist', async () => {
    mockRepo.findAllActive.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });

  it('propagates repository errors', async () => {
    mockRepo.findAllActive.mockRejectedValue(new Error('DB unavailable'));

    await expect(useCase.execute()).rejects.toThrow('DB unavailable');
  });
});
