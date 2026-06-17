import { ListIncomeConceptsUseCase } from './list-income-concepts.use-case';
import { IncomeConcept } from '../../../domain/entities/income-concept.entity';
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

describe('ListIncomeConceptsUseCase', () => {
  let useCase: ListIncomeConceptsUseCase;
  let mockRepo: jest.Mocked<IIncomeConceptRepository>;

  beforeEach(() => {
    mockRepo = {
      findActiveByDoctor: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    useCase = new ListIncomeConceptsUseCase(mockRepo);
  });

  it('returns mapped items for the doctor', async () => {
    mockRepo.findActiveByDoctor.mockResolvedValue([
      makeConcept({ id: 'c-1', name: 'Urgencia' }),
      makeConcept({ id: 'c-2', name: 'Revisión', sortOrder: 1 }),
    ]);

    const result = await useCase.execute('doc-1');

    expect(mockRepo.findActiveByDoctor).toHaveBeenCalledWith('doc-1');
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('Urgencia');
    expect(result[1]?.sortOrder).toBe(1);
  });

  it('returns empty array when no active concepts exist', async () => {
    mockRepo.findActiveByDoctor.mockResolvedValue([]);
    const result = await useCase.execute('doc-1');
    expect(result).toEqual([]);
  });

  it('maps all output fields correctly', async () => {
    const createdAt = new Date('2026-06-17T10:00:00Z');
    const updatedAt = new Date('2026-06-17T11:00:00Z');
    mockRepo.findActiveByDoctor.mockResolvedValue([
      makeConcept({ id: 'c-99', name: 'Test', isActive: true, sortOrder: 2, createdAt, updatedAt }),
    ]);

    const [item] = await useCase.execute('doc-1');

    expect(item).toEqual({
      id: 'c-99',
      doctorId: 'doc-1',
      name: 'Test',
      isActive: true,
      sortOrder: 2,
      createdAt,
      updatedAt,
    });
  });
});
