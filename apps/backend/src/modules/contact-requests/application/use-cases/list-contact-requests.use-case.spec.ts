import { ListContactRequestsUseCase } from './list-contact-requests.use-case';
import type { IContactRequestRepository } from '../../domain/repositories/icontact-request.repository';

describe('ListContactRequestsUseCase', () => {
  let useCase: ListContactRequestsUseCase;
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
    useCase = new ListContactRequestsUseCase(mockRepo);
  });

  it('returns empty list when no requests exist', async () => {
    mockRepo.listWithDoctor.mockResolvedValue({ items: [], total: 0 });

    const result = await useCase.execute({ limit: 50, offset: 0 });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('maps items to output correctly', async () => {
    mockRepo.listWithDoctor.mockResolvedValue({
      items: [
        {
          id: 'req-1',
          doctorId: 'doctor-1',
          doctorName: 'Dr. Test',
          doctorEmail: 'dr@test.com',
          doctorPhone: '+584140000000',
          doctorPlan: 'free_trial',
          doctorSpecialty: 'Cardiología',
          channel: 'whatsapp',
          message: 'Necesito ayuda',
          status: 'pending',
          handledBy: null,
          handledAt: null,
          notes: null,
          notificationCount: 1,
          lastNotifiedAt: null,
          createdAt: new Date('2026-10-30T10:00:00Z'),
          updatedAt: new Date('2026-10-30T10:00:00Z'),
        },
      ],
      total: 1,
    });

    const result = await useCase.execute({ limit: 50, offset: 0 });

    expect(result.total).toBe(1);
    const item = result.items[0];
    expect(item).toBeDefined();
    expect(item!.id).toBe('req-1');
    expect(item!.doctorName).toBe('Dr. Test');
    expect(item!.channel).toBe('whatsapp');
    expect(typeof item!.createdAt).toBe('string');
  });

  it('passes status filter to repository', async () => {
    mockRepo.listWithDoctor.mockResolvedValue({ items: [], total: 0 });

    await useCase.execute({ status: 'pending', limit: 50, offset: 0 });

    expect(mockRepo.listWithDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    );
  });

  it('passes date filters to repository as Date objects', async () => {
    mockRepo.listWithDoctor.mockResolvedValue({ items: [], total: 0 });

    await useCase.execute({
      from: '2026-10-01T00:00:00Z',
      to: '2026-10-31T23:59:59Z',
      limit: 50,
      offset: 0,
    });

    expect(mockRepo.listWithDoctor).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.any(Date),
        to: expect.any(Date),
      }),
    );
  });
});
