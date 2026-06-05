import { DeleteQuickItemUseCase } from './delete-quick-item.use-case';
import type { IQuickItemRepository } from '../../../domain/repositories/quick-item.repository';
import { QuickItemNotFoundError } from '../../../domain/errors/quick-item-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const ITEM_ID = 'iiiiiiii-0000-0000-0000-000000000001';

describe('DeleteQuickItemUseCase', () => {
  let useCase: DeleteQuickItemUseCase;
  let mockRepo: jest.Mocked<IQuickItemRepository>;

  beforeEach(() => {
    mockRepo = {
      listByDoctor: jest.fn(),
      findByIdForDoctor: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new DeleteQuickItemUseCase(mockRepo);
  });

  it('deletes the item when it exists', async () => {
    mockRepo.delete.mockResolvedValue(undefined);

    await expect(useCase.execute(ITEM_ID, DOCTOR_ID)).resolves.toBeUndefined();
    expect(mockRepo.delete).toHaveBeenCalledWith(ITEM_ID, DOCTOR_ID);
  });

  it('propagates QuickItemNotFoundError from repo (not found / cross-doctor)', async () => {
    mockRepo.delete.mockRejectedValue(new QuickItemNotFoundError());

    await expect(useCase.execute(ITEM_ID, DOCTOR_ID)).rejects.toBeInstanceOf(QuickItemNotFoundError);
  });

  it('scopes the delete by both itemId and doctorId', async () => {
    const OTHER_DOCTOR = 'dddddddd-0000-0000-0000-000000000099';
    mockRepo.delete.mockResolvedValue(undefined);

    await useCase.execute(ITEM_ID, OTHER_DOCTOR);

    expect(mockRepo.delete).toHaveBeenCalledWith(ITEM_ID, OTHER_DOCTOR);
  });
});
