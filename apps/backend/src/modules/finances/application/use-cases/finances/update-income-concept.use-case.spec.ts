import { UpdateIncomeConceptUseCase } from './update-income-concept.use-case';
import { IncomeConcept } from '../../../domain/entities/income-concept.entity';
import { IncomeConceptNotFoundError } from '../../../domain/errors/income-concept-not-found.error';
import { ForbiddenDomainError } from '../../../domain/errors/forbidden-domain.error';
import type { IIncomeConceptRepository } from '../../../domain/repositories/income-concept.repository';

const makeConcept = (overrides: Partial<Parameters<typeof IncomeConcept.create>[0]> = {}) =>
  IncomeConcept.create({
    id: 'c-1',
    doctorId: 'doc-1',
    name: 'Consulta',
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2026-06-17T10:00:00Z'),
    updatedAt: new Date('2026-06-17T10:00:00Z'),
    ...overrides,
  });

describe('UpdateIncomeConceptUseCase', () => {
  let useCase: UpdateIncomeConceptUseCase;
  let mockRepo: jest.Mocked<IIncomeConceptRepository>;

  beforeEach(() => {
    mockRepo = {
      findActiveByDoctor: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    useCase = new UpdateIncomeConceptUseCase(mockRepo);
  });

  it('updates concept name and returns DTO', async () => {
    const original = makeConcept();
    const updated = original.patch({ name: 'Urgencia' });
    mockRepo.findById.mockResolvedValue(original);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({ id: 'c-1', doctorId: 'doc-1', name: 'Urgencia' });

    expect(mockRepo.update).toHaveBeenCalledTimes(1);
    expect(result.name).toBe('Urgencia');
  });

  it('throws IncomeConceptNotFoundError when concept is absent', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(useCase.execute({ id: 'missing', doctorId: 'doc-1' })).rejects.toThrow(
      IncomeConceptNotFoundError,
    );
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('throws ForbiddenDomainError when concept belongs to another doctor', async () => {
    mockRepo.findById.mockResolvedValue(makeConcept({ doctorId: 'other-doc' }));
    await expect(useCase.execute({ id: 'c-1', doctorId: 'doc-1' })).rejects.toThrow(
      ForbiddenDomainError,
    );
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('can deactivate a concept', async () => {
    const original = makeConcept();
    const updated = original.patch({ isActive: false });
    mockRepo.findById.mockResolvedValue(original);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({ id: 'c-1', doctorId: 'doc-1', isActive: false });

    expect(result.isActive).toBe(false);
  });

  it('can update sortOrder', async () => {
    const original = makeConcept({ sortOrder: 0 });
    const updated = original.patch({ sortOrder: 5 });
    mockRepo.findById.mockResolvedValue(original);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({ id: 'c-1', doctorId: 'doc-1', sortOrder: 5 });

    expect(result.sortOrder).toBe(5);
  });
});
