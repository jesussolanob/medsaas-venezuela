import { UpdateSpecialtyUseCase } from './update-specialty.use-case';
import type { ISpecialtyRepository } from '../../domain/repositories/specialty.repository';
import { Specialty } from '../../domain/entities/specialty.entity';
import { SpecialtyNotFoundError } from '../../domain/errors/specialty-not-found.error';
import { SpecialtyConflictError } from '../../domain/errors/specialty-conflict.error';

const now = new Date('2026-06-11T00:00:00Z');

function makeSpecialty(overrides = {}): Specialty {
  return Specialty.reconstitute({
    id: 'cccc0000-0000-0000-0000-000000000001',
    name: 'Cardiología',
    isActive: true,
    sortOrder: 20,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('UpdateSpecialtyUseCase', () => {
  let useCase: UpdateSpecialtyUseCase;
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
    useCase = new UpdateSpecialtyUseCase(mockRepo);
  });

  it('updates name when no conflict exists', async () => {
    const original = makeSpecialty();
    const updated = makeSpecialty({ name: 'Neurología' });
    mockRepo.findById.mockResolvedValue(original);
    mockRepo.findByName.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({ id: original.id, name: 'Neurología' });

    expect(mockRepo.findByName).toHaveBeenCalledWith('Neurología');
    expect(mockRepo.update).toHaveBeenCalledWith(original.id, {
      name: 'Neurología',
      isActive: undefined,
      sortOrder: undefined,
    });
    expect(result.name).toBe('Neurología');
  });

  it('does not check for name conflict when name is unchanged', async () => {
    const original = makeSpecialty();
    const updated = makeSpecialty({ isActive: false });
    mockRepo.findById.mockResolvedValue(original);
    mockRepo.update.mockResolvedValue(updated);

    await useCase.execute({ id: original.id, isActive: false });

    expect(mockRepo.findByName).not.toHaveBeenCalled();
  });

  it('deactivates a specialty (is_active = false)', async () => {
    const original = makeSpecialty({ isActive: true });
    const updated = makeSpecialty({ isActive: false });
    mockRepo.findById.mockResolvedValue(original);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({ id: original.id, isActive: false });

    expect(result.isActive).toBe(false);
    expect(mockRepo.update).toHaveBeenCalledWith(original.id, {
      name: undefined,
      isActive: false,
      sortOrder: undefined,
    });
  });

  it('updates sort_order', async () => {
    const original = makeSpecialty();
    const updated = makeSpecialty({ sortOrder: 50 });
    mockRepo.findById.mockResolvedValue(original);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({ id: original.id, sortOrder: 50 });

    expect(result.sortOrder).toBe(50);
  });

  it('throws SpecialtyNotFoundError when specialty does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'non-existent-id' })).rejects.toThrow(
      SpecialtyNotFoundError,
    );
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('throws SpecialtyConflictError when new name belongs to another specialty', async () => {
    const original = makeSpecialty();
    const conflicting = makeSpecialty({
      id: 'dddd0000-0000-0000-0000-000000000002',
      name: 'Neurología',
    });
    mockRepo.findById.mockResolvedValue(original);
    mockRepo.findByName.mockResolvedValue(conflicting);

    await expect(useCase.execute({ id: original.id, name: 'Neurología' })).rejects.toThrow(
      SpecialtyConflictError,
    );
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('allows setting the same name (no-op conflict check)', async () => {
    const original = makeSpecialty({ name: 'Cardiología' });
    const updated = makeSpecialty();
    mockRepo.findById.mockResolvedValue(original);
    mockRepo.update.mockResolvedValue(updated);

    await useCase.execute({ id: original.id, name: 'Cardiología' });

    expect(mockRepo.findByName).not.toHaveBeenCalled();
    expect(mockRepo.update).toHaveBeenCalled();
  });
});
