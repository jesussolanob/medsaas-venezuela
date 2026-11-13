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
      reserveNotificationSlot: jest.fn(),
      listWithDoctor: jest.fn(),
      findByIdWithDoctor: jest.fn(),
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
    mockRepo.reserveNotificationSlot.mockResolvedValue(true); // slot available by default
    mockRepo.findPendingByDoctorId.mockResolvedValue(null);
    mockRepo.findAllSuperAdmins.mockResolvedValue([
      { id: 'admin-1', email: 'admin@test.com', fullName: 'Admin' },
    ]);
    mockRepo.findByIdWithDoctor.mockResolvedValue(null);
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
    it('throws ContactRequestRateLimitedError when reserveNotificationSlot returns false', async () => {
      // Arrange: slot already exhausted (3 notifications sent in the last 24h)
      mockRepo.save.mockResolvedValue(makeRequest());
      mockRepo.reserveNotificationSlot.mockResolvedValue(false);

      await expect(useCase.execute({ doctorId: 'doctor-1', channel: 'whatsapp' })).rejects.toThrow(
        ContactRequestRateLimitedError,
      );
    });

    it('upsert happens BEFORE the rate-limit check (TOCTOU fix)', async () => {
      // Arrange: rate-limited
      mockRepo.save.mockResolvedValue(makeRequest());
      mockRepo.reserveNotificationSlot.mockResolvedValue(false);

      // Act: should throw 429
      await expect(useCase.execute({ doctorId: 'doctor-1', channel: 'whatsapp' })).rejects.toThrow(
        ContactRequestRateLimitedError,
      );

      // Assert: save was called BEFORE the 429, proving the request row is persisted
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });

    it('does not throw when slot is available', async () => {
      mockRepo.reserveNotificationSlot.mockResolvedValue(true);
      mockRepo.save.mockResolvedValue(makeRequest());

      await expect(
        useCase.execute({ doctorId: 'doctor-1', channel: 'whatsapp' }),
      ).resolves.toBeDefined();
    });

    it('calls reserveNotificationSlot with doctorId and RATE_LIMIT_MAX=3', async () => {
      mockRepo.save.mockResolvedValue(makeRequest());

      await useCase.execute({ doctorId: 'doctor-abc', channel: 'whatsapp' });

      expect(mockRepo.reserveNotificationSlot).toHaveBeenCalledWith(
        'doctor-abc',
        expect.any(Date),
        expect.any(Date),
        3, // RATE_LIMIT_MAX — counts across ALL requests in the window
      );
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

    it('uses findByIdWithDoctor for doctor data in email — not the newest request', async () => {
      // Arrange: there are two requests. req-older belongs to doctor-correct;
      // a newer request from a different doctor exists but should not affect
      // the email for req-older.
      const olderReq = makeRequest({ id: 'req-older', doctorId: 'doctor-correct' });
      mockRepo.save.mockResolvedValue(olderReq);

      mockRepo.findByIdWithDoctor.mockResolvedValue({
        id: 'req-older',
        doctorId: 'doctor-correct',
        doctorName: 'Dr. Correcto',
        doctorEmail: 'correcto@test.com',
        doctorPhone: '+58414000001',
        doctorPlan: 'delta_plus',
        doctorSpecialty: 'Cardiología',
        channel: 'whatsapp',
        message: null,
        status: 'pending',
        handledBy: null,
        handledAt: null,
        notes: null,
        notificationCount: 0,
        lastNotifiedAt: null,
        createdAt: new Date('2026-10-30T10:00:00Z'),
        updatedAt: new Date('2026-10-30T10:00:00Z'),
      });

      // Act
      await useCase.execute({ doctorId: 'doctor-correct', channel: 'whatsapp' });

      // Drain microtasks so the fire-and-forget sendAdminNotification completes
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      // Assert: mailer received the correct doctor name, not a fallback
      expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
        'support_contact_request',
        expect.any(Array),
        expect.objectContaining({ doctorName: 'Dr. Correcto' }),
        expect.anything(),
      );

      // Confirm we used findByIdWithDoctor (not listWithDoctor)
      expect(mockRepo.findByIdWithDoctor).toHaveBeenCalledWith('req-older');
      expect(mockRepo.listWithDoctor).not.toHaveBeenCalled();
    });

    it('sends email with fallback values when findByIdWithDoctor returns null', async () => {
      mockRepo.save.mockResolvedValue(makeRequest({ id: 'req-missing' }));
      mockRepo.findByIdWithDoctor.mockResolvedValue(null);

      await useCase.execute({ doctorId: 'doctor-1', channel: 'whatsapp' });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
        'support_contact_request',
        expect.any(Array),
        expect.objectContaining({ doctorName: 'Especialista' }),
        expect.anything(),
      );
    });
  });

  describe('double-click race condition', () => {
    it('falls back to updatePendingForDoctor when save throws SequelizeUniqueConstraintError', async () => {
      // Arrange: no pending request visible to this request, but a concurrent
      // request inserts the row before us → unique constraint violation
      mockRepo.findPendingByDoctorId.mockResolvedValue(null);

      const uniqueErr = Object.assign(new Error('Validation error'), {
        name: 'SequelizeUniqueConstraintError',
      });
      mockRepo.save.mockRejectedValueOnce(uniqueErr);

      const fallbackReq = makeRequest({ id: 'req-race', channel: 'call' });
      mockRepo.updatePendingForDoctor.mockResolvedValue(fallbackReq);

      // Act
      const result = await useCase.execute({ doctorId: 'doctor-1', channel: 'call' });

      // Assert: request succeeds and returns the upserted row
      expect(result.id).toBe('req-race');
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      expect(mockRepo.updatePendingForDoctor).toHaveBeenCalledTimes(1);
    });

    it('falls back when save throws with pg code 23505 (original.code)', async () => {
      mockRepo.findPendingByDoctorId.mockResolvedValue(null);

      const pgErr = Object.assign(new Error('duplicate key'), {
        name: 'SequelizeDatabaseError',
        original: { code: '23505' },
      });
      mockRepo.save.mockRejectedValueOnce(pgErr);

      const fallbackReq = makeRequest({ id: 'req-pgrace', channel: 'email' });
      mockRepo.updatePendingForDoctor.mockResolvedValue(fallbackReq);

      const result = await useCase.execute({ doctorId: 'doctor-1', channel: 'email' });

      expect(result.id).toBe('req-pgrace');
    });

    it('rethrows non-unique-constraint errors from save', async () => {
      mockRepo.findPendingByDoctorId.mockResolvedValue(null);

      mockRepo.save.mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(useCase.execute({ doctorId: 'doctor-1', channel: 'email' })).rejects.toThrow(
        'DB connection lost',
      );
    });
  });
});
