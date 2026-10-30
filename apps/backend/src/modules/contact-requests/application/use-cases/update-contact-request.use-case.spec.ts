import { UpdateContactRequestUseCase } from './update-contact-request.use-case';
import { ContactRequestNotFoundError } from '../../domain/errors/contact-request-not-found.error';
import { InvalidContactRequestTransitionError } from '../../domain/errors/invalid-contact-request-transition.error';
import type { IContactRequestRepository } from '../../domain/repositories/icontact-request.repository';
import { ContactRequest } from '../../domain/entities/contact-request.entity';

function makeRequest(status: 'pending' | 'contacted' | 'resolved'): ContactRequest {
  return ContactRequest.create({
    id: 'req-1',
    doctorId: 'doctor-1',
    channel: 'whatsapp',
    message: null,
    status,
    handledBy: null,
    handledAt: null,
    notes: null,
    notificationCount: 0,
    lastNotifiedAt: null,
    createdAt: new Date('2026-10-30T10:00:00Z'),
    updatedAt: new Date('2026-10-30T10:00:00Z'),
  });
}

describe('UpdateContactRequestUseCase', () => {
  let useCase: UpdateContactRequestUseCase;
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
    useCase = new UpdateContactRequestUseCase(mockRepo);
  });

  it('throws ContactRequestNotFoundError when request does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ id: 'missing', actorId: 'admin-1', status: 'contacted' }),
    ).rejects.toThrow(ContactRequestNotFoundError);
  });

  it('throws InvalidContactRequestTransitionError for invalid transition', async () => {
    mockRepo.findById.mockResolvedValue(makeRequest('resolved'));

    await expect(
      useCase.execute({ id: 'req-1', actorId: 'admin-1', status: 'pending' }),
    ).rejects.toThrow(InvalidContactRequestTransitionError);
  });

  it('updates status from pending to contacted', async () => {
    mockRepo.findById.mockResolvedValue(makeRequest('pending'));
    mockRepo.update.mockResolvedValue(
      ContactRequest.create({
        id: 'req-1',
        doctorId: 'doctor-1',
        channel: 'whatsapp',
        message: null,
        status: 'contacted',
        handledBy: 'admin-1',
        handledAt: new Date(),
        notes: null,
        notificationCount: 0,
        lastNotifiedAt: null,
        createdAt: new Date('2026-10-30T10:00:00Z'),
        updatedAt: new Date(),
      }),
    );

    const result = await useCase.execute({
      id: 'req-1',
      actorId: 'admin-1',
      status: 'contacted',
    });

    expect(result.status).toBe('contacted');
    expect(result.handledBy).toBe('admin-1');
    expect(mockRepo.update).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({ status: 'contacted', handledBy: 'admin-1' }),
    );
  });

  it('updates notes without changing status', async () => {
    mockRepo.findById.mockResolvedValue(makeRequest('pending'));
    mockRepo.update.mockResolvedValue(
      ContactRequest.create({
        id: 'req-1',
        doctorId: 'doctor-1',
        channel: 'whatsapp',
        message: null,
        status: 'pending',
        handledBy: null,
        handledAt: null,
        notes: 'Llamado a las 3pm',
        notificationCount: 0,
        lastNotifiedAt: null,
        createdAt: new Date('2026-10-30T10:00:00Z'),
        updatedAt: new Date(),
      }),
    );

    const result = await useCase.execute({
      id: 'req-1',
      actorId: 'admin-1',
      notes: 'Llamado a las 3pm',
    });

    expect(result.notes).toBe('Llamado a las 3pm');
    expect(mockRepo.update).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({ notes: 'Llamado a las 3pm' }),
    );
  });

  it('returns ISO string dates', async () => {
    mockRepo.findById.mockResolvedValue(makeRequest('pending'));
    mockRepo.update.mockResolvedValue(makeRequest('pending'));

    const result = await useCase.execute({ id: 'req-1', actorId: 'admin-1' });

    expect(typeof result.updatedAt).toBe('string');
  });
});
