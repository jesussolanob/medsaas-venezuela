import { CreateQuickItemUseCase } from './create-quick-item.use-case';
import type { IQuickItemRepository } from '../../../domain/repositories/quick-item.repository';
import { QuickItem } from '../../../domain/entities/quick-item.entity';
import type { CreateQuickItemDto } from '@delta/shared-types';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const ITEM_ID = 'iiiiiiii-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

function makeSavedItem(overrides: Partial<Parameters<typeof QuickItem.create>[0]> = {}): QuickItem {
  return QuickItem.create({
    id: ITEM_ID,
    doctorId: DOCTOR_ID,
    itemType: 'exam',
    name: 'Hemograma',
    category: null,
    details: null,
    createdAt: now,
    ...overrides,
  });
}

describe('CreateQuickItemUseCase', () => {
  let useCase: CreateQuickItemUseCase;
  let mockRepo: jest.Mocked<IQuickItemRepository>;

  beforeEach(() => {
    mockRepo = {
      listByDoctor: jest.fn(),
      findByIdForDoctor: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new CreateQuickItemUseCase(mockRepo);
  });

  it('creates an exam quick item and returns saved entity', async () => {
    const dto: CreateQuickItemDto = { item_type: 'exam', name: 'Hemograma', category: 'Lab', details: null };
    const saved = makeSavedItem({ category: 'Lab' });
    mockRepo.create.mockResolvedValue(saved);

    const result = await useCase.execute(dto, DOCTOR_ID);

    expect(result).toBe(saved);
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
  });

  it('creates a medication quick item and returns saved entity', async () => {
    const dto: CreateQuickItemDto = { item_type: 'medication', name: 'Ibuprofeno 400mg', category: null, details: '1 tab c/8h' };
    const saved = makeSavedItem({ itemType: 'medication', name: 'Ibuprofeno 400mg', details: '1 tab c/8h' });
    mockRepo.create.mockResolvedValue(saved);

    const result = await useCase.execute(dto, DOCTOR_ID);

    expect(result.itemType).toBe('medication');
    expect(result.name).toBe('Ibuprofeno 400mg');
  });

  it('persists doctorId from the authenticated actor (anti-IDOR)', async () => {
    const dto: CreateQuickItemDto = { item_type: 'exam', name: 'Rx tórax', category: null, details: null };
    const saved = makeSavedItem();
    mockRepo.create.mockResolvedValue(saved);

    await useCase.execute(dto, DOCTOR_ID);

    const call = mockRepo.create.mock.calls[0];
    expect(call).toBeDefined();
    const passedItem = call![0] as QuickItem;
    expect(passedItem.doctorId).toBe(DOCTOR_ID);
  });

  it('generates a UUID for the new item id', async () => {
    const dto: CreateQuickItemDto = { item_type: 'exam', name: 'Glucemia', category: null, details: null };
    mockRepo.create.mockResolvedValue(makeSavedItem());

    await useCase.execute(dto, DOCTOR_ID);

    const call = mockRepo.create.mock.calls[0];
    expect(call).toBeDefined();
    const passedItem = call![0] as QuickItem;
    expect(passedItem.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('defaults category and details to null when not provided', async () => {
    const dto: CreateQuickItemDto = { item_type: 'medication', name: 'Omeprazol' };
    mockRepo.create.mockResolvedValue(makeSavedItem({ category: null, details: null }));

    await useCase.execute(dto, DOCTOR_ID);

    const call = mockRepo.create.mock.calls[0];
    expect(call).toBeDefined();
    const passedItem = call![0] as QuickItem;
    expect(passedItem.category).toBeNull();
    expect(passedItem.details).toBeNull();
  });

  it('propagates repository errors', async () => {
    const dto: CreateQuickItemDto = { item_type: 'exam', name: 'Eco', category: null, details: null };
    mockRepo.create.mockRejectedValue(new Error('DB error'));

    await expect(useCase.execute(dto, DOCTOR_ID)).rejects.toThrow('DB error');
  });
});
