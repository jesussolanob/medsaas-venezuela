import { ListQuickItemsUseCase } from './list-quick-items.use-case';
import type { IQuickItemRepository } from '../../../domain/repositories/quick-item.repository';
import { QuickItem } from '../../../domain/entities/quick-item.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

function makeItem(overrides: Partial<Parameters<typeof QuickItem.create>[0]> = {}): QuickItem {
  return QuickItem.create({
    id: 'iiiiiiii-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    itemType: 'exam',
    name: 'Hemograma',
    category: null,
    details: null,
    createdAt: now,
    ...overrides,
  });
}

describe('ListQuickItemsUseCase', () => {
  let useCase: ListQuickItemsUseCase;
  let mockRepo: jest.Mocked<IQuickItemRepository>;

  beforeEach(() => {
    mockRepo = {
      listByDoctor: jest.fn(),
      findByIdForDoctor: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new ListQuickItemsUseCase(mockRepo);
  });

  it('returns all items for the doctor when no type filter is given', async () => {
    const items = [makeItem(), makeItem({ itemType: 'medication', name: 'Ibuprofeno' })];
    mockRepo.listByDoctor.mockResolvedValue(items);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toHaveLength(2);
    expect(mockRepo.listByDoctor).toHaveBeenCalledWith(DOCTOR_ID, undefined);
  });

  it('passes the itemType filter to the repository', async () => {
    const items = [makeItem({ itemType: 'exam' })];
    mockRepo.listByDoctor.mockResolvedValue(items);

    const result = await useCase.execute(DOCTOR_ID, 'exam');

    expect(result).toHaveLength(1);
    expect(mockRepo.listByDoctor).toHaveBeenCalledWith(DOCTOR_ID, 'exam');
  });

  it('returns empty array when doctor has no items', async () => {
    mockRepo.listByDoctor.mockResolvedValue([]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toHaveLength(0);
  });

  it('passes medication type filter correctly', async () => {
    mockRepo.listByDoctor.mockResolvedValue([]);

    await useCase.execute(DOCTOR_ID, 'medication');

    expect(mockRepo.listByDoctor).toHaveBeenCalledWith(DOCTOR_ID, 'medication');
  });
});
