import { Test, type TestingModule } from '@nestjs/testing';
import { ContactRequestsController } from './contact-requests.controller';
import { GetSupportInfoUseCase } from '../../application/use-cases/get-support-info.use-case';
import { RequestContactUseCase } from '../../application/use-cases/request-contact.use-case';
import { GetCurrentContactRequestUseCase } from '../../application/use-cases/get-current-contact-request.use-case';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const currentUser: CurrentUserPayload = {
  sub: DOCTOR_ID,
  role: 'doctor',
  email: 'doctor@dev.local',
};

describe('ContactRequestsController', () => {
  let controller: ContactRequestsController;
  let getSupportInfo: { execute: jest.Mock };
  let requestContact: { execute: jest.Mock };
  let getCurrentRequest: { execute: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    getSupportInfo = { execute: jest.fn() };
    requestContact = { execute: jest.fn() };
    getCurrentRequest = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactRequestsController],
      providers: [
        { provide: GetSupportInfoUseCase, useValue: getSupportInfo },
        { provide: RequestContactUseCase, useValue: requestContact },
        { provide: GetCurrentContactRequestUseCase, useValue: getCurrentRequest },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(ContactRequestsController);
  });

  describe('GET /api/doctor/support-info', () => {
    it('returns support info from use case', async () => {
      const info = {
        whatsapp: '584221033582',
        callNowAvailable: true,
        supportHours: {
          days: [1, 2, 3, 4, 5, 6],
          start: '08:00',
          end: '18:00',
          timezone: 'America/Caracas',
        },
      };
      getSupportInfo.execute.mockResolvedValue(info);

      const result = await controller.supportInfo();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(info);
    });
  });

  describe('POST /api/doctor/contact-requests', () => {
    it('calls requestContact with doctorId from user', async () => {
      const output = {
        id: 'req-1',
        channel: 'whatsapp',
        status: 'pending',
        createdAt: '2026-10-30T10:00:00.000Z',
        updatedAt: '2026-10-30T10:00:00.000Z',
      };
      requestContact.execute.mockResolvedValue(output);

      const result = await controller.create(currentUser, { channel: 'whatsapp', message: null });

      expect(result.success).toBe(true);
      expect(requestContact.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID, channel: 'whatsapp' }),
      );
    });

    it('throws ZodError on invalid channel', async () => {
      await expect(controller.create(currentUser, { channel: 'invalid' })).rejects.toThrow();
    });

    it('throws ZodError when message exceeds 500 chars', async () => {
      await expect(
        controller.create(currentUser, { channel: 'email', message: 'a'.repeat(501) }),
      ).rejects.toThrow();
    });
  });

  describe('GET /api/doctor/contact-requests/current', () => {
    it('returns null when no pending request', async () => {
      getCurrentRequest.execute.mockResolvedValue(null);

      const result = await controller.current(currentUser);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('returns request data when pending request exists', async () => {
      const pending = {
        id: 'req-1',
        channel: 'email',
        message: null,
        status: 'pending',
        createdAt: '2026-10-30T10:00:00.000Z',
        updatedAt: '2026-10-30T10:00:00.000Z',
      };
      getCurrentRequest.execute.mockResolvedValue(pending);

      const result = await controller.current(currentUser);

      expect(result.data).toEqual(pending);
    });
  });
});
