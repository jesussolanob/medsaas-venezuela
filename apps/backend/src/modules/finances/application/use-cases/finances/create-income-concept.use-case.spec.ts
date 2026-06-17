import { CreateIncomeConceptUseCase } from './create-income-concept.use-case';
import { IncomeConcept } from '../../../domain/entities/income-concept.entity';
import type { IIncomeConceptRepository } from '../../../domain/repositories/income-concept.repository';

const makeSavedConcept = (overrides: Partial<Parameters<typeof IncomeConcept.create>[0]> = {}) =>
  IncomeConcept.create({
    id: 'c-new',
    doctorId: 'doc-1',
    name: 'Consulta',
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2026-06-17T10:00:00Z'),
    updatedAt: new Date('2026-06-17T10:00:00Z'),
    ...overrides,
  });

describe('CreateIncomeConceptUseCase', () => {
  let useCase: CreateIncomeConceptUseCase;
  let mockRepo: jest.Mocked<IIncomeConceptRepository>;

  beforeEach(() => {
    mockRepo = {
      findActiveByDoctor: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    useCase = new CreateIncomeConceptUseCase(mockRepo);
  });

  it('saves a new concept and returns output DTO', async () => {
    mockRepo.save.mockResolvedValue(makeSavedConcept({ name: 'Urgencia' }));

    const result = await useCase.execute({ doctorId: 'doc-1', name: 'Urgencia' });

    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    const savedArg = mockRepo.save.mock.calls[0]?.[0];
    expect(savedArg?.doctorId).toBe('doc-1');
    expect(savedArg?.name).toBe('Urgencia');
    expect(savedArg?.isActive).toBe(true);
    expect(savedArg?.sortOrder).toBe(0);
    expect(result.name).toBe('Urgencia');
    expect(result.isActive).toBe(true);
  });

  it('generates a UUID for the new concept', async () => {
    mockRepo.save.mockImplementation(async (c) => c);

    const result = await useCase.execute({ doctorId: 'doc-1', name: 'Test' });

    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('propagates repository errors', async () => {
    mockRepo.save.mockRejectedValue(new Error('DB error'));
    await expect(useCase.execute({ doctorId: 'doc-1', name: 'Test' })).rejects.toThrow('DB error');
  });
});
