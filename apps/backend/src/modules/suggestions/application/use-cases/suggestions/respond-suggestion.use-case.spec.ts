import { RespondSuggestionUseCase } from './respond-suggestion.use-case';
import type { ISuggestionRepository } from '../../../domain/repositories/suggestion.repository';
import { Suggestion } from '../../../domain/entities/suggestion.entity';
import { SuggestionNotFoundError } from '../../../domain/errors/suggestion-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const SUGGESTION_ID = 'ssssssss-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeSuggestion(
  overrides: Partial<ConstructorParameters<typeof Suggestion>[0]> = {},
): Suggestion {
  return Suggestion.create({
    id: SUGGESTION_ID,
    doctorId: DOCTOR_ID,
    subject: 'Better UI',
    message: 'Make the UI cleaner',
    category: 'general',
    status: 'pending',
    adminResponse: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('RespondSuggestionUseCase', () => {
  let useCase: RespondSuggestionUseCase;
  let mockRepo: jest.Mocked<ISuggestionRepository>;

  beforeEach(() => {
    mockRepo = {
      listForDoctor: jest.fn(),
      listAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    useCase = new RespondSuggestionUseCase(mockRepo);
  });

  it('responds to a suggestion with a new status', async () => {
    const suggestion = makeSuggestion();
    const updated = suggestion.respond('reviewed', 'Noted, thank you!');
    mockRepo.findById.mockResolvedValue(suggestion);
    mockRepo.save.mockResolvedValue(updated);

    const result = await useCase.execute({
      suggestionId: SUGGESTION_ID,
      status: 'reviewed',
      adminResponse: 'Noted, thank you!',
    });

    expect(mockRepo.findById).toHaveBeenCalledWith(SUGGESTION_ID);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('reviewed');
    expect(result.adminResponse).toBe('Noted, thank you!');
  });

  it('throws SuggestionNotFoundError when suggestion does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ suggestionId: SUGGESTION_ID, status: 'done' })).rejects.toThrow(
      SuggestionNotFoundError,
    );
  });

  it('passes null adminResponse when not provided', async () => {
    const suggestion = makeSuggestion();
    mockRepo.findById.mockResolvedValue(suggestion);
    mockRepo.save.mockImplementation(async (s) => s);

    await useCase.execute({ suggestionId: SUGGESTION_ID, status: 'planned' });

    const savedArg = mockRepo.save.mock.calls[0]![0]!;
    // adminResponse is null because suggestion had null and no new one was provided
    expect(savedArg.adminResponse).toBeNull();
  });

  it('does not call save when suggestion is not found', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ suggestionId: SUGGESTION_ID, status: 'done' }),
    ).rejects.toThrow();

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('handles all valid statuses', async () => {
    const validStatuses: Suggestion['status'][] = [
      'pending',
      'reviewed',
      'planned',
      'done',
      'rejected',
    ];

    for (const status of validStatuses) {
      const suggestion = makeSuggestion();
      const updated = suggestion.respond(status, null);
      mockRepo.findById.mockResolvedValue(suggestion);
      mockRepo.save.mockResolvedValue(updated);

      const result = await useCase.execute({ suggestionId: SUGGESTION_ID, status });
      expect(result.status).toBe(status);
    }
  });
});
