import { ListMySuggestionsUseCase } from './list-my-suggestions.use-case';
import type { ISuggestionRepository } from '../../../domain/repositories/suggestion.repository';
import { Suggestion } from '../../../domain/entities/suggestion.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeSuggestion(id = 'ssssssss-0000-0000-0000-000000000001'): Suggestion {
  return Suggestion.create({
    id,
    doctorId: DOCTOR_ID,
    subject: 'Better reports',
    message: 'Reports should be exportable',
    category: 'general',
    status: 'pending',
    adminResponse: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe('ListMySuggestionsUseCase', () => {
  let useCase: ListMySuggestionsUseCase;
  let mockRepo: jest.Mocked<ISuggestionRepository>;

  beforeEach(() => {
    mockRepo = {
      listForDoctor: jest.fn(),
      listAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    useCase = new ListMySuggestionsUseCase(mockRepo);
  });

  it('returns suggestions for the authenticated doctor', async () => {
    const suggestions = [makeSuggestion()];
    mockRepo.listForDoctor.mockResolvedValue(suggestions);

    const result = await useCase.execute({ doctorId: DOCTOR_ID });

    expect(mockRepo.listForDoctor).toHaveBeenCalledWith(DOCTOR_ID);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(Suggestion);
  });

  it('returns empty array when doctor has no suggestions', async () => {
    mockRepo.listForDoctor.mockResolvedValue([]);

    const result = await useCase.execute({ doctorId: DOCTOR_ID });

    expect(result).toHaveLength(0);
  });

  it('returns multiple suggestions ordered as returned by repo', async () => {
    const suggestions = [
      makeSuggestion('ssssssss-0000-0000-0000-000000000002'),
      makeSuggestion('ssssssss-0000-0000-0000-000000000001'),
    ];
    mockRepo.listForDoctor.mockResolvedValue(suggestions);

    const result = await useCase.execute({ doctorId: DOCTOR_ID });

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('ssssssss-0000-0000-0000-000000000002');
  });
});
