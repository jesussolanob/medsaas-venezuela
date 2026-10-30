import { RequestContactUseCase } from './request-contact.use-case';
import { CallNowOutsideSupportHoursError } from '../../domain/errors/call-now-outside-support-hours.error';
import { ContactRequestRateLimitedError } from '../../domain/errors/contact-request-rate-limited.error';
import type { IContactRequestRepository } from '../../domain/repositories/icontact-request.repository';
import type { MailerService } from '../../../email/application/services/mailer.service';
import type { ConfigService } from '@nestjs/config';
import type { ContactRequest } from '../../domain/entities/contact-request.entity';

function makeRequest(overrides: Partial<ContactRequest> = {}): ContactRequest {
  return {
    id: 'req-1',
    doctorId: 'doctor-1',
    channel: 'whatsapp',
    message: null,
    status: 'pending',
    handledBy: null,
    handledAt: null,
    notes: null,
    notificationCount: 0,
    lastNotifiedAt: null,
    createdAt: new Date('2026-10-30T14:00:00Z'),
    updatedAt: new Date('2026-10-30T14:00:00Z'),
    isPending: () => true,
    canTransitionTo: () => true,
    ...overrides,
  } as unknown as ContactRequest;
}

describe('RequestContactUseCase', () => {
  let useCase: RequestContactUseCase;
  let mockRepo: jest.Mocked<IContactRequestRepository>;
  let mockMailer: jest.Mocked<MailerService>;
  let mockConfig: jest.Mocked<ConfigService>;

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

    mockMailer = {
      sendTemplate: jest.fn(),
    } as unknown as jest.Mocked<MailerService>;

    mockConfig = {
      get: jest.fn().mockReturnValue('https://deltasalud.app'),
    } as unknown as jest.Mocked<ConfigService>;

    // Default: outside support hours → support_hours returns empty
    // The hours key is NOT set, so defaults are used (Mon-Sat 08:00-18:00)
    mockRepo.getSettings.mockResolvedValue([]);
    mockRepo.getNotificationCountSince.mockResolvedValue(0);
    mockRepo.findPendingByDoctorId.mockResolvedValue(null);
    mockRepo.findAllSuperAdmins.mockResolvedValue([
      { id: 'admin-1', email: 'admin@test.com', fullName: 'Admin' },
    ]);
    mockRepo.listWithDoctor.mockResolvedValue({ items: [], total: 0 });
    mockRepo.incrementNotificationCount.mockResolvedValue();
    mockMailer.sendTemplate.mockResolvedValue({
      id: 'email-1',
    });

    useCase = new RequestContactUseCase(mockRepo, mockMailer, mockConfig);
  });

  describe('call_now channel validation', () => {
    it('throws CallNowOutsideSupportHoursError when support_hours says outside hours', async () => {
      // Set support_hours to something that guarantees the current time is outside
      // Use days: [] so any time is outside
      mockRepo.getSettings.mockResolvedValue([
        {
          key: 'support_hours',
          value: JSON.stringify({
            days: [],
            start: '08:00',
            end: '18:00',
            timezone: 'America/Caracas',
          }),
        },
      ]);

      await expect(useCase.execute({ doctorId: 'doctor-1', channel: 'call_now' })).rejects.toThrow(
        CallNowOutsideSupportHoursError,
      );
    });

    it('does NOT throw for non-call_now channels when outside support hours', async () => {
      mockRepo.getSettings.mockResolvedValue([
        {
          key: 'support_hours',
          value: JSON.stringify({
            days: [],
            start: '08:00',
            end: '18:00',
            timezone: 'America/Caracas',
          }),
        },
      ]);
      mockRepo.save.mockResolvedValue(makeRequest({ channel: 'whatsapp' }));

      await expect(
        useCase.execute({ doctorId: 'doctor-1', channel: 'whatsapp' }),
      ).resolves.toBeDefined();
    });
  });

  describe('rate limiting', () => {
    it('throws ContactRequestRateLimitedError when notification count >= 3', async () => {
      mockRepo.getNotificationCountSince.mockResolvedValue(3);

      await expect(useCase.execute({ doctorId: 'doctor-1', channel: 'whatsapp' })).rejects.toThrow(
        ContactRequestRateLimitedError,
      );
    });

    it('does not throw when count is 2', async () => {
      mockRepo.getNotificationCountSince.mockResolvedValue(2);
      mockRepo.save.mockResolvedValue(makeRequest());

      await expect(
        useCase.execute({ doctorId: 'doctor-1', channel: 'whatsapp' }),
      ).resolves.toBeDefined();
    });
  });

  describe('upsert logic', () => {
    it('creates a new request when no pending request exists', async () => {
      mockRepo.findPendingByDoctorId.mockResolvedValue(null);
      mockRepo.save.mockResolvedValue(makeRequest());

      await useCase.execute({ doctorId: 'doctor-1', channel: 'email' });

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      expect(mockRepo.updatePendingForDoctor).not.toHaveBeenCalled();
    });

    it('updates the existing pending request when one already exists', async () => {
      const existing = makeRequest({ channel: 'email' });
      mockRepo.findPendingByDoctorId.mockResolvedValue(existing);
      mockRepo.updatePendingForDoctor.mockResolvedValue(makeRequest({ channel: 'whatsapp' }));

      await useCase.execute({ doctorId: 'doctor-1', channel: 'whatsapp' });

      expect(mockRepo.updatePendingForDoctor).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('return value', () => {
    it('returns correct output shape', async () => {
      const req = makeRequest({ id: 'req-uuid', status: 'pending', channel: 'call' });
      mockRepo.save.mockResolvedValue(req);

      const result = await useCase.execute({ doctorId: 'doctor-1', channel: 'call' });

      expect(result.id).toBe('req-uuid');
      expect(result.channel).toBe('call');
      expect(result.status).toBe('pending');
      expect(typeof result.createdAt).toBe('string');
      expect(typeof result.updatedAt).toBe('string');
    });
  });

  describe('email notification', () => {
    it('does not throw when mailer fails (fire-and-forget)', async () => {
      mockRepo.save.mockResolvedValue(makeRequest());
      mockMailer.sendTemplate.mockRejectedValue(new Error('SMTP error'));

      await expect(
        useCase.execute({ doctorId: 'doctor-1', channel: 'email' }),
      ).resolves.toBeDefined();
    });
  });
});
