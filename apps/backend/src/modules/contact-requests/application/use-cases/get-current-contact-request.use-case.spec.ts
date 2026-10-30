import { GetCurrentContactRequestUseCase } from './get-current-contact-request.use-case';
import type { IContactRequestRepository } from '../../domain/repositories/icontact-request.repository';
import { ContactRequest } from '../../domain/entities/contact-request.entity';

describe('GetCurrentContactRequestUseCase', () => {
  let useCase: GetCurrentContactRequestUseCase;
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
      listWithDoctor: jest.fn(),
      countPending: jest.fn(),
      findAllSuperAdmins: jest.fn(),
      getSettings: jest.fn(),
    };
    useCase = new GetCurrentContactRequestUseCase(mockRepo);
  });

  it('returns null when no pending request exists', async () => {
    mockRepo.findPendingByDoctorId.mockResolvedValue(null);

    const result = await useCase.execute('doctor-1');

    expect(result).toBeNull();
  });

  it('returns the pending request data', async () => {
    const req = ContactRequest.create({
      id: 'req-1',
      doctorId: 'doctor-1',
      channel: 'whatsapp',
      message: 'Hola',
      status: 'pending',
      handledBy: null,
      handledAt: null,
      notes: null,
      notificationCount: 0,
      lastNotifiedAt: null,
      createdAt: new Date('2026-10-30T10:00:00Z'),
      updatedAt: new Date('2026-10-30T10:00:00Z'),
    });
    mockRepo.findPendingByDoctorId.mockResolvedValue(req);

    const result = await useCase.execute('doctor-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('req-1');
    expect(result!.channel).toBe('whatsapp');
    expect(result!.message).toBe('Hola');
    expect(result!.status).toBe('pending');
    expect(typeof result!.createdAt).toBe('string');
  });
});
