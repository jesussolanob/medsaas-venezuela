import { CreateSpecialtyUseCase } from './create-specialty.use-case';
import type { ISpecialtyRepository } from '../../domain/repositories/specialty.repository';
import { Specialty } from '../../domain/entities/specialty.entity';
import { SpecialtyConflictError } from '../../domain/errors/specialty-conflict.error';

const now = new Date('2026-06-11T00:00:00Z');

function makeSpecialty(overrides = {}): Specialty {
  return Specialty.reconstitute({
    id: 'bbbb0000-0000-0000-0000-000000000001',
    name: 'Cardiología',
    isActive: true,
    sortOrder: 100,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('CreateSpecialtyUseCase', () => {
  let useCase: CreateSpecialtyUseCase;
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
    useCase = new CreateSpecialtyUseCase(mockRepo);
  });

  it('creates a specialty when name is unique', async () => {
    mockRepo.findByName.mockResolvedValue(null);
    const saved = makeSpecialty({ name: 'Neurología' });
    mockRepo.create.mockResolvedValue(saved);

    const result = await useCase.execute({ name: 'Neurología' });

    expect(mockRepo.findByName).toHaveBeenCalledWith('Neurología');
    expect(mockRepo.create).toHaveBeenCalledWith({ name: 'Neurología', sortOrder: 100 });
    expect(result.name).toBe('Neurología');
  });

  it('uses provided sort_order when given', async () => {
    mockRepo.findByName.mockResolvedValue(null);
    const saved = makeSpecialty({ sortOrder: 30 });
    mockRepo.create.mockResolvedValue(saved);

    await useCase.execute({ name: 'Cardiología', sortOrder: 30 });

    expect(mockRepo.create).toHaveBeenCalledWith({ name: 'Cardiología', sortOrder: 30 });
  });

  it('defaults sort_order to 100 when not provided', async () => {
    mockRepo.findByName.mockResolvedValue(null);
    mockRepo.create.mockResolvedValue(makeSpecialty());

    await useCase.execute({ name: 'Cardiología' });

    expect(mockRepo.create).toHaveBeenCalledWith({ name: 'Cardiología', sortOrder: 100 });
  });

  it('throws SpecialtyConflictError when name already exists', async () => {
    mockRepo.findByName.mockResolvedValue(makeSpecialty());

    await expect(useCase.execute({ name: 'Cardiología' })).rejects.toThrow(SpecialtyConflictError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('SpecialtyConflictError carries code SPECIALTY_CONFLICT', async () => {
    mockRepo.findByName.mockResolvedValue(makeSpecialty());

    await expect(useCase.execute({ name: 'Cardiología' })).rejects.toMatchObject({
      code: 'SPECIALTY_CONFLICT',
    });
  });

  it('propagates unexpected repository errors', async () => {
    mockRepo.findByName.mockRejectedValue(new Error('DB connection lost'));

    await expect(useCase.execute({ name: 'Cardiología' })).rejects.toThrow('DB connection lost');
  });
});
