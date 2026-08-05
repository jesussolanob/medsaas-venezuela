import { Test, type TestingModule } from '@nestjs/testing';
import { CronRemindersController } from './cron-reminders.controller';
import { DispatchDueRemindersUseCase } from '../../application/use-cases/reminders/dispatch-due-reminders.use-case';
import { DispatchDoctorInactivityNoticesUseCase } from '../../application/use-cases/reminders/dispatch-doctor-inactivity-notices.use-case';
import { DispatchPendingConsultationRemindersUseCase } from '../../../pending-consultations/application/use-cases/dispatch-pending-consultation-reminders.use-case';
import { ExpireDuePendingConsultationsUseCase } from '../../../pending-consultations/application/use-cases/expire-due-pending-consultations.use-case';
import { CronSecretGuard } from '../../../../infrastructure/guards/cron-secret.guard';

describe('CronRemindersController', () => {
  let controller: CronRemindersController;
  let mockDispatchDueReminders: { execute: jest.Mock };
  let mockDispatchDoctorInactivityNotices: { execute: jest.Mock };
  let mockDispatchPendingReminders: { execute: jest.Mock };
  let mockExpirePending: { execute: jest.Mock };

  beforeEach(async () => {
    mockDispatchDueReminders = {
      execute: jest.fn().mockResolvedValue({ sent24h: 0, failed24h: 0, sent1h: 0, failed1h: 0 }),
    };
    mockDispatchDoctorInactivityNotices = {
      execute: jest.fn().mockResolvedValue({ sent10: 0, sent15: 0, skipped: 0, failed: 0 }),
    };
    mockDispatchPendingReminders = {
      execute: jest.fn().mockResolvedValue({ sent: 0, skipped: 0, failed: 0 }),
    };
    mockExpirePending = {
      execute: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CronRemindersController],
      providers: [
        { provide: DispatchDueRemindersUseCase, useValue: mockDispatchDueReminders },
        {
          provide: DispatchDoctorInactivityNoticesUseCase,
          useValue: mockDispatchDoctorInactivityNotices,
        },
        {
          provide: DispatchPendingConsultationRemindersUseCase,
          useValue: mockDispatchPendingReminders,
        },
        { provide: ExpireDuePendingConsultationsUseCase, useValue: mockExpirePending },
      ],
    })
      .overrideGuard(CronSecretGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CronRemindersController>(CronRemindersController);
  });

  describe('run (appointment-reminders) — unaffected by the new endpoint', () => {
    it('returns the existing envelope shape', async () => {
      const result = await controller.run();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({ sent24h: 0, failed24h: 0, sent1h: 0, failed1h: 0 }),
      );
      expect(mockDispatchDoctorInactivityNotices.execute).not.toHaveBeenCalled();
    });
  });

  describe('runDoctorInactivity', () => {
    it('delegates to DispatchDoctorInactivityNoticesUseCase and returns the envelope', async () => {
      mockDispatchDoctorInactivityNotices.execute.mockResolvedValue({
        sent10: 2,
        sent15: 1,
        skipped: 5,
        failed: 0,
      });

      const result = await controller.runDoctorInactivity();

      expect(mockDispatchDoctorInactivityNotices.execute).toHaveBeenCalledWith();
      expect(result).toEqual({
        success: true,
        data: { sent10: 2, sent15: 1, skipped: 5, failed: 0 },
      });
    });

    it('exposes only aggregate counts — no PII fields on the response shape', async () => {
      mockDispatchDoctorInactivityNotices.execute.mockResolvedValue({
        sent10: 1,
        sent15: 0,
        skipped: 0,
        failed: 0,
      });

      const result = await controller.runDoctorInactivity();

      expect(Object.keys(result.data)).toEqual(['sent10', 'sent15', 'skipped', 'failed']);
    });

    it('is protected by CronSecretGuard', () => {
      const guardsMeta = Reflect.getMetadata(
        '__guards__',
        CronRemindersController.prototype.runDoctorInactivity,
      ) as unknown[] | undefined;

      expect(guardsMeta).toBeDefined();
      expect(guardsMeta).toContain(CronSecretGuard);
    });

    it('is registered as a separate POST route from appointment-reminders', () => {
      const path = Reflect.getMetadata(
        'path',
        CronRemindersController.prototype.runDoctorInactivity,
      ) as string;

      expect(path).toBe('doctor-inactivity');
    });
  });
});
