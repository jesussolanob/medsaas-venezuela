import { DeleteOfficeUseCase } from './delete-office.use-case';
import type { IOfficeRepository } from '../../../domain/repositories/office.repository';
import { OfficeNotFoundError } from '../../../domain/errors/office-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OFFICE_ID = 'oooooooo-0000-0000-0000-000000000001';

describe('DeleteOfficeUseCase', () => {
  let useCase: DeleteOfficeUseCase;
  let mockRepo: jest.Mocked<IOfficeRepository>;

  beforeEach(() => {
    mockRepo = {
      listByDoctor: jest.fn(),
      findByIdForDoctor: jest.fn(),
      findActiveByDoctor: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new DeleteOfficeUseCase(mockRepo);
  });

  it('deletes the office when it exists', async () => {
    mockRepo.delete.mockResolvedValue(undefined);

    await expect(useCase.execute(OFFICE_ID, DOCTOR_ID)).resolves.toBeUndefined();
    expect(mockRepo.delete).toHaveBeenCalledWith(OFFICE_ID, DOCTOR_ID);
  });

  it('propagates OfficeNotFoundError from repo (not found / cross-doctor)', async () => {
    mockRepo.delete.mockRejectedValue(new OfficeNotFoundError());

    await expect(useCase.execute(OFFICE_ID, DOCTOR_ID)).rejects.toBeInstanceOf(OfficeNotFoundError);
  });
});
