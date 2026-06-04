import { Test, type TestingModule } from '@nestjs/testing';
import { AdminSuggestionsController } from './admin-suggestions.controller';
import { ListAllSuggestionsUseCase } from '../../application/use-cases/suggestions/list-all-suggestions.use-case';
import { RespondSuggestionUseCase } from '../../application/use-cases/suggestions/respond-suggestion.use-case';
import { Suggestion } from '../../domain/entities/suggestion.entity';
import { SuggestionNotFoundError } from '../../domain/errors/suggestion-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const SUGGESTION_ID = 'ssssssss-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeSuggestion(
  overrides: Partial<ConstructorParameters<typeof Suggestion>[0]> = {},
): Suggestion {
  return Suggestion.create({
    id: SUGGESTION_ID,
    doctorId: DOCTOR_ID,
    subject: 'Feature request',
    message: 'Please add dark mode',
    category: 'general',
    status: 'pending',
    adminResponse: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('AdminSuggestionsController', () => {
  let controller: AdminSuggestionsController;

  const mockListAll = { execute: jest.fn() };
  const mockRespond = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminSuggestionsController],
      providers: [
        { provide: ListAllSuggestionsUseCase, useValue: mockListAll },
        { provide: RespondSuggestionUseCase, useValue: mockRespond },
      ],
    }).compile();

    controller = module.get<AdminSuggestionsController>(AdminSuggestionsController);
  });

  describe('listAll', () => {
    it('returns all suggestions in a success envelope', async () => {
      const suggestions = [makeSuggestion()];
      mockListAll.execute.mockResolvedValue(suggestions);

      const result = await controller.listAll();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockListAll.execute).toHaveBeenCalledWith({ status: undefined });
    });

    it('passes status filter when provided as a valid value', async () => {
      mockListAll.execute.mockResolvedValue([]);

      await controller.listAll('reviewed');

      expect(mockListAll.execute).toHaveBeenCalledWith({ status: 'reviewed' });
    });

    it('ignores invalid status query param (passes undefined)', async () => {
      mockListAll.execute.mockResolvedValue([]);

      await controller.listAll('invalid_status');

      expect(mockListAll.execute).toHaveBeenCalledWith({ status: undefined });
    });

    it('returns empty data array when no suggestions', async () => {
      mockListAll.execute.mockResolvedValue([]);

      const result = await controller.listAll();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('respond', () => {
    it('returns the updated suggestion in a success envelope', async () => {
      const suggestion = makeSuggestion({ status: 'reviewed', adminResponse: 'Noted!' });
      mockRespond.execute.mockResolvedValue(suggestion);

      const result = await controller.respond(SUGGESTION_ID, {
        status: 'reviewed',
        admin_response: 'Noted!',
      });

      expect(result.success).toBe(true);
      expect(mockRespond.execute).toHaveBeenCalledWith({
        suggestionId: SUGGESTION_ID,
        status: 'reviewed',
        adminResponse: 'Noted!',
      });
    });

    it('passes null adminResponse when admin_response is not provided', async () => {
      const suggestion = makeSuggestion({ status: 'done' });
      mockRespond.execute.mockResolvedValue(suggestion);

      await controller.respond(SUGGESTION_ID, { status: 'done' });

      expect(mockRespond.execute).toHaveBeenCalledWith(
        expect.objectContaining({ adminResponse: null }),
      );
    });

    it('propagates SuggestionNotFoundError when suggestion does not exist', async () => {
      mockRespond.execute.mockRejectedValue(new SuggestionNotFoundError());

      await expect(controller.respond(SUGGESTION_ID, { status: 'reviewed' })).rejects.toThrow(
        SuggestionNotFoundError,
      );
    });

    it('maps the updated suggestion to API response format', async () => {
      const suggestion = makeSuggestion({ status: 'planned', adminResponse: 'On roadmap' });
      mockRespond.execute.mockResolvedValue(suggestion);

      const result = await controller.respond(SUGGESTION_ID, {
        status: 'planned',
        admin_response: 'On roadmap',
      });

      const data = result.data as Record<string, unknown>;
      expect(data.id).toBe(SUGGESTION_ID);
      expect(data.status).toBe('planned');
      expect(data.admin_response).toBe('On roadmap');
    });
  });
});
