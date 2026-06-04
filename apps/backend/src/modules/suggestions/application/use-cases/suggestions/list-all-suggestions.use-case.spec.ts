import { ListAllSuggestionsUseCase } from './list-all-suggestions.use-case';
import type { ISuggestionRepository } from '../../../domain/repositories/suggestion.repository';
import { Suggestion } from '../../../domain/entities/suggestion.entity';

const DOCTOR_ID_1 = 'dddddddd-0000-0000-0000-000000000001';
const DOCTOR_ID_2 = 'dddddddd-0000-0000-0000-000000000002';
const now = new Date('2026-06-01T00:00:00Z');

function makeSuggestion(
  id: string,
  doctorId: string,
  status: Suggestion['status'] = 'pending',
): Suggestion {
  return Suggestion.create({
    id,
    doctorId,
    subject: 'A suggestion',
    message: 'Some message',
    category: 'general',
    status,
    adminResponse: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe('ListAllSuggestionsUseCase', () => {
  let useCase: ListAllSuggestionsUseCase;
  let mockRepo: jest.Mocked<ISuggestionRepository>;

  beforeEach(() => {
    mockRepo = {
      listForDoctor: jest.fn(),
      listAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    useCase = new ListAllSuggestionsUseCase(mockRepo);
  });

  it('returns all suggestions across doctors when no filter given', async () => {
    const suggestions = [
      makeSuggestion('ssssssss-0000-0000-0000-000000000001', DOCTOR_ID_1),
      makeSuggestion('ssssssss-0000-0000-0000-000000000002', DOCTOR_ID_2),
    ];
    mockRepo.listAll.mockResolvedValue(suggestions);

    const result = await useCase.execute({});

    expect(mockRepo.listAll).toHaveBeenCalledWith({ status: undefined });
    expect(result).toHaveLength(2);
  });

  it('passes status filter to repository when provided', async () => {
    mockRepo.listAll.mockResolvedValue([]);

    await useCase.execute({ status: 'reviewed' });

    expect(mockRepo.listAll).toHaveBeenCalledWith({ status: 'reviewed' });
  });

  it('returns empty array when no suggestions exist', async () => {
    mockRepo.listAll.mockResolvedValue([]);

    const result = await useCase.execute({});

    expect(result).toHaveLength(0);
  });

  it('returns suggestions from multiple doctors', async () => {
    const suggestions = [
      makeSuggestion('ssssssss-0000-0000-0000-000000000001', DOCTOR_ID_1, 'pending'),
      makeSuggestion('ssssssss-0000-0000-0000-000000000002', DOCTOR_ID_2, 'done'),
    ];
    mockRepo.listAll.mockResolvedValue(suggestions);

    const result = await useCase.execute({});

    expect(result[0]!.doctorId).toBe(DOCTOR_ID_1);
    expect(result[1]!.doctorId).toBe(DOCTOR_ID_2);
  });
});
