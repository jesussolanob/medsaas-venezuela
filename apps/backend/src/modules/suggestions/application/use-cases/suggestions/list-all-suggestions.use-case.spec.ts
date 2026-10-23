import { ListAllSuggestionsUseCase } from './list-all-suggestions.use-case';
import type { ISuggestionRepository } from '../../../domain/repositories/suggestion.repository';
import type { ISuggestionProfileLookupRepository } from '../../../domain/repositories/suggestion-profile-lookup.repository';
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
  let mockProfileLookup: jest.Mocked<ISuggestionProfileLookupRepository>;

  beforeEach(() => {
    mockRepo = {
      listForDoctor: jest.fn(),
      listAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    mockProfileLookup = {
      findByIds: jest.fn().mockResolvedValue([]),
    };
    useCase = new ListAllSuggestionsUseCase(mockRepo, mockProfileLookup);
  });

  it('returns all suggestions across doctors when no filter given', async () => {
    const suggestions = [
      makeSuggestion('ssssssss-0000-0000-0000-000000000001', DOCTOR_ID_1),
      makeSuggestion('ssssssss-0000-0000-0000-000000000002', DOCTOR_ID_2),
    ];
    mockRepo.listAll.mockResolvedValue(suggestions);

    const result = await useCase.execute({});

    expect(mockRepo.listAll).toHaveBeenCalledWith({ status: undefined });
    expect(result.suggestions).toHaveLength(2);
  });

  it('passes status filter to repository when provided', async () => {
    mockRepo.listAll.mockResolvedValue([]);

    await useCase.execute({ status: 'reviewed' });

    expect(mockRepo.listAll).toHaveBeenCalledWith({ status: 'reviewed' });
  });

  it('returns empty array when no suggestions exist', async () => {
    mockRepo.listAll.mockResolvedValue([]);

    const result = await useCase.execute({});

    expect(result.suggestions).toHaveLength(0);
  });

  it('returns suggestions from multiple doctors', async () => {
    const suggestions = [
      makeSuggestion('ssssssss-0000-0000-0000-000000000001', DOCTOR_ID_1, 'pending'),
      makeSuggestion('ssssssss-0000-0000-0000-000000000002', DOCTOR_ID_2, 'done'),
    ];
    mockRepo.listAll.mockResolvedValue(suggestions);

    const result = await useCase.execute({});

    expect(result.suggestions[0]!.doctorId).toBe(DOCTOR_ID_1);
    expect(result.suggestions[1]!.doctorId).toBe(DOCTOR_ID_2);
  });

  // ---------------------------------------------------------------------------
  // Profile enrichment
  // ---------------------------------------------------------------------------

  it('calls findByIds with distinct doctorIds from suggestions', async () => {
    const s1 = makeSuggestion('ssssssss-0000-0000-0000-000000000001', DOCTOR_ID_1);
    const s2 = makeSuggestion('ssssssss-0000-0000-0000-000000000002', DOCTOR_ID_1); // same doctor
    mockRepo.listAll.mockResolvedValue([s1, s2]);

    await useCase.execute({});

    // Deduplication: only one unique doctorId
    expect(mockProfileLookup.findByIds).toHaveBeenCalledWith([DOCTOR_ID_1]);
  });

  it('returns profiles map keyed by doctorId', async () => {
    mockRepo.listAll.mockResolvedValue([
      makeSuggestion('ssssssss-0000-0000-0000-000000000001', DOCTOR_ID_1),
    ]);
    mockProfileLookup.findByIds.mockResolvedValue([
      { id: DOCTOR_ID_1, fullName: 'Dra. Smith', email: 'smith@clinic.com', specialty: 'Cardio' },
    ]);

    const result = await useCase.execute({});

    expect(result.profiles.get(DOCTOR_ID_1)).toMatchObject({
      fullName: 'Dra. Smith',
      specialty: 'Cardio',
    });
  });

  it('does not call findByIds when suggestion list is empty', async () => {
    mockRepo.listAll.mockResolvedValue([]);

    await useCase.execute({});

    expect(mockProfileLookup.findByIds).toHaveBeenCalledWith([]);
  });

  it('returns empty profiles map when profile lookup returns no rows', async () => {
    mockRepo.listAll.mockResolvedValue([
      makeSuggestion('ssssssss-0000-0000-0000-000000000001', DOCTOR_ID_1),
    ]);
    mockProfileLookup.findByIds.mockResolvedValue([]);

    const result = await useCase.execute({});

    expect(result.profiles.size).toBe(0);
  });
});
