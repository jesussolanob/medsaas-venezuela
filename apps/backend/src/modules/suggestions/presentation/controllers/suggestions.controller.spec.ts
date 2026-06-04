import { Test, type TestingModule } from '@nestjs/testing';
import { SuggestionsController } from './suggestions.controller';
import { ListMySuggestionsUseCase } from '../../application/use-cases/suggestions/list-my-suggestions.use-case';
import { CreateSuggestionUseCase } from '../../application/use-cases/suggestions/create-suggestion.use-case';
import { Suggestion } from '../../domain/entities/suggestion.entity';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const SUGGESTION_ID = 'ssssssss-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

const mockUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };

function makeSuggestion(
  overrides: Partial<ConstructorParameters<typeof Suggestion>[0]> = {},
): Suggestion {
  return Suggestion.create({
    id: SUGGESTION_ID,
    doctorId: DOCTOR_ID,
    subject: 'Better reports',
    message: 'Please add PDF export',
    category: 'general',
    status: 'pending',
    adminResponse: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('SuggestionsController', () => {
  let controller: SuggestionsController;

  const mockListMy = { execute: jest.fn() };
  const mockCreate = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuggestionsController],
      providers: [
        { provide: ListMySuggestionsUseCase, useValue: mockListMy },
        { provide: CreateSuggestionUseCase, useValue: mockCreate },
      ],
    }).compile();

    controller = module.get<SuggestionsController>(SuggestionsController);
  });

  describe('list', () => {
    it('returns success envelope with suggestion list', async () => {
      const suggestions = [makeSuggestion()];
      mockListMy.execute.mockResolvedValue(suggestions);

      const result = await controller.list(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockListMy.execute).toHaveBeenCalledWith({ doctorId: DOCTOR_ID });
    });

    it('returns empty data array when doctor has no suggestions', async () => {
      mockListMy.execute.mockResolvedValue([]);

      const result = await controller.list(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('always uses doctorId from the authenticated user (anti-IDOR)', async () => {
      mockListMy.execute.mockResolvedValue([]);

      await controller.list(mockUser);

      expect(mockListMy.execute).toHaveBeenCalledWith({ doctorId: DOCTOR_ID });
    });
  });

  describe('create', () => {
    it('returns the created suggestion in a success envelope', async () => {
      const suggestion = makeSuggestion();
      mockCreate.execute.mockResolvedValue(suggestion);

      const result = await controller.create(
        { subject: 'Better reports', message: 'PDF please', category: 'general' },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(mockCreate.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          doctorId: DOCTOR_ID,
          subject: 'Better reports',
          message: 'PDF please',
        }),
      );
    });

    it('always uses doctorId from the authenticated user (anti-IDOR)', async () => {
      const suggestion = makeSuggestion();
      mockCreate.execute.mockResolvedValue(suggestion);

      await controller.create(
        { subject: 'Test', message: 'Test msg', category: 'general' },
        mockUser,
      );

      const callArg = mockCreate.execute.mock.calls[0]![0] as { doctorId: string };
      expect(callArg.doctorId).toBe(DOCTOR_ID);
    });

    it('maps suggestion fields to API response', async () => {
      const suggestion = makeSuggestion();
      mockCreate.execute.mockResolvedValue(suggestion);

      const result = await controller.create(
        { subject: 'Better reports', message: 'PDF please', category: 'general' },
        mockUser,
      );

      const data = result.data as Record<string, unknown>;
      expect(data.id).toBe(SUGGESTION_ID);
      expect(data.subject).toBe('Better reports');
      expect(data.status).toBe('pending');
    });
  });
});
