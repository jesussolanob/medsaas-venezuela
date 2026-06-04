import { CreateSuggestionUseCase } from './create-suggestion.use-case';
import type { ISuggestionRepository } from '../../../domain/repositories/suggestion.repository';
import { Suggestion } from '../../../domain/entities/suggestion.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

describe('CreateSuggestionUseCase', () => {
  let useCase: CreateSuggestionUseCase;
  let mockRepo: jest.Mocked<ISuggestionRepository>;

  beforeEach(() => {
    mockRepo = {
      listForDoctor: jest.fn(),
      listAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    useCase = new CreateSuggestionUseCase(mockRepo);
  });

  it('creates a suggestion with required fields', async () => {
    const saved = Suggestion.create({
      id: 'ssssssss-0000-0000-0000-000000000001',
      doctorId: DOCTOR_ID,
      subject: 'Improve reports',
      message: 'Export to PDF please',
      category: 'general',
      status: 'pending',
      adminResponse: null,
      createdAt: now,
      updatedAt: now,
    });
    mockRepo.create.mockResolvedValue(saved);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      subject: 'Improve reports',
      message: 'Export to PDF please',
    });

    expect(mockRepo.create).toHaveBeenCalledTimes(1);
    expect(result.subject).toBe('Improve reports');
    expect(result.doctorId).toBe(DOCTOR_ID);
  });

  it('defaults category to "general" when not provided', async () => {
    mockRepo.create.mockImplementation(async (suggestion) => suggestion);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      subject: 'Test',
      message: 'Test message',
    });

    expect(result.category).toBe('general');
  });

  it('uses the provided category when specified', async () => {
    mockRepo.create.mockImplementation(async (suggestion) => suggestion);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      subject: 'Test',
      message: 'Test message',
      category: 'billing',
    });

    expect(result.category).toBe('billing');
  });

  it('always sets status to "pending" on creation', async () => {
    mockRepo.create.mockImplementation(async (suggestion) => suggestion);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      subject: 'Test',
      message: 'Test message',
    });

    expect(result.status).toBe('pending');
  });

  it('sets adminResponse to null on creation', async () => {
    mockRepo.create.mockImplementation(async (suggestion) => suggestion);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      subject: 'Test',
      message: 'Test message',
    });

    expect(result.adminResponse).toBeNull();
  });

  it('generates a unique id for each suggestion', async () => {
    mockRepo.create.mockImplementation(async (suggestion) => suggestion);

    const result1 = await useCase.execute({
      doctorId: DOCTOR_ID,
      subject: 'Test 1',
      message: 'Msg 1',
    });
    const result2 = await useCase.execute({
      doctorId: DOCTOR_ID,
      subject: 'Test 2',
      message: 'Msg 2',
    });

    expect(result1.id).not.toBe(result2.id);
  });
});
