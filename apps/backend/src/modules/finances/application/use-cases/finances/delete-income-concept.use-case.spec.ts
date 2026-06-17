import { DeleteIncomeConceptUseCase } from './delete-income-concept.use-case';
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

describe('DeleteIncomeConceptUseCase', () => {
  let useCase: DeleteIncomeConceptUseCase;
  let mockRepo: jest.Mocked<IIncomeConceptRepository>;

  beforeEach(() => {
    mockRepo = {
      findActiveByDoctor: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    useCase = new DeleteIncomeConceptUseCase(mockRepo);
  });

  it('soft-deletes a concept by setting isActive=false', async () => {
    const concept = makeConcept();
    mockRepo.findById.mockResolvedValue(concept);
    mockRepo.update.mockResolvedValue(concept.patch({ isActive: false }));

    await useCase.execute({ id: 'c-1', doctorId: 'doc-1' });

    expect(mockRepo.update).toHaveBeenCalledTimes(1);
    const updatedArg = mockRepo.update.mock.calls[0]?.[0];
    expect(updatedArg?.isActive).toBe(false);
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
});
