import { CountPendingContactRequestsUseCase } from './count-pending-contact-requests.use-case';
import type { IContactRequestRepository } from '../../domain/repositories/icontact-request.repository';

describe('CountPendingContactRequestsUseCase', () => {
  let useCase: CountPendingContactRequestsUseCase;
  let mockRepo: jest.Mocked<IContactRequestRepository>;

  beforeEach(() => {
    mockRepo = {
      save: jest.fn(),
      updatePendingForDoctor: jest.fn(),
      findPendingByDoctorId: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      getNotificationCountSince: jest.fn(),
      incrementNotificationCount: jest.fn(),
      reserveNotificationSlot: jest.fn(),
      listWithDoctor: jest.fn(),
      findByIdWithDoctor: jest.fn(),
      countPending: jest.fn(),
      findAllSuperAdmins: jest.fn(),
      getSettings: jest.fn(),
    };
    useCase = new CountPendingContactRequestsUseCase(mockRepo);
  });

  it('returns 0 when no pending requests', async () => {
    mockRepo.countPending.mockResolvedValue(0);

    const result = await useCase.execute();

    expect(result).toBe(0);
  });

  it('returns the count from the repository', async () => {
    mockRepo.countPending.mockResolvedValue(5);

    const result = await useCase.execute();

    expect(result).toBe(5);
  });
});
