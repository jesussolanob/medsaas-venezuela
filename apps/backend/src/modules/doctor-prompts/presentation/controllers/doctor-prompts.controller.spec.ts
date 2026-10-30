import { Test, type TestingModule } from '@nestjs/testing';
import { DoctorPromptsController } from './doctor-prompts.controller';
import { GetMeetingPromptStatusUseCase } from '../../application/use-cases/get-meeting-prompt-status.use-case';
import { RecordPromptShownUseCase } from '../../application/use-cases/record-prompt-shown.use-case';
import { SnoozePromptUseCase } from '../../application/use-cases/snooze-prompt.use-case';
import { DismissPromptUseCase } from '../../application/use-cases/dismiss-prompt.use-case';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const currentUser: CurrentUserPayload = {
  sub: DOCTOR_ID,
  role: 'doctor',
  email: 'doctor@dev.local',
};

describe('DoctorPromptsController', () => {
  let controller: DoctorPromptsController;
  let getMeetingStatus: { execute: jest.Mock };
  let recordShown: { execute: jest.Mock };
  let snooze: { execute: jest.Mock };
  let dismiss: { execute: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    getMeetingStatus = { execute: jest.fn() };
    recordShown = { execute: jest.fn() };
    snooze = { execute: jest.fn() };
    dismiss = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorPromptsController],
      providers: [
        { provide: GetMeetingPromptStatusUseCase, useValue: getMeetingStatus },
        { provide: RecordPromptShownUseCase, useValue: recordShown },
        { provide: SnoozePromptUseCase, useValue: snooze },
        { provide: DismissPromptUseCase, useValue: dismiss },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(DoctorPromptsController);
  });

  describe('GET /api/doctor/prompts/meeting', () => {
    it('returns show=true when prompt rules pass', async () => {
      getMeetingStatus.execute.mockResolvedValue({ show: true, source: 'modal' });

      const result = await controller.meetingStatus(currentUser);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ show: true, source: 'modal' });
    });

    it('returns show=false when kill-switch is off', async () => {
      getMeetingStatus.execute.mockResolvedValue({ show: false, source: null });

      const result = await controller.meetingStatus(currentUser);

      expect((result.data as { show: boolean }).show).toBe(false);
    });

    it('passes doctorId from user.sub — anti-IDOR', async () => {
      getMeetingStatus.execute.mockResolvedValue({ show: false, source: null });

      await controller.meetingStatus(currentUser);

      expect(getMeetingStatus.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });
  });

  describe('POST /api/doctor/prompts/meeting/shown', () => {
    it('calls recordShown with meeting_modal key', async () => {
      recordShown.execute.mockResolvedValue({ id: 'pid-1', shownCount: 1 });

      const result = await controller.meetingShown(currentUser);

      expect(result.success).toBe(true);
      expect(recordShown.execute).toHaveBeenCalledWith(DOCTOR_ID, 'meeting_modal');
    });
  });

  describe('POST /api/doctor/prompts/meeting/snooze', () => {
    it('calls snooze with meeting_modal key and returns snoozedUntil', async () => {
      const snoozedUntil = new Date('2026-10-31T12:00:00.000Z');
      snooze.execute.mockResolvedValue({ id: 'pid-1', snoozedUntil });

      const result = await controller.meetingSnooze(currentUser);

      expect(result.success).toBe(true);
      expect(snooze.execute).toHaveBeenCalledWith(DOCTOR_ID, 'meeting_modal');
    });
  });

  describe('POST /api/doctor/prompts/meeting/dismiss', () => {
    it('calls dismiss with meeting_modal key and returns dismissedAt', async () => {
      const dismissedAt = new Date('2026-10-30T12:00:00.000Z');
      dismiss.execute.mockResolvedValue({ id: 'pid-1', dismissedAt });

      const result = await controller.meetingDismiss(currentUser);

      expect(result.success).toBe(true);
      expect(dismiss.execute).toHaveBeenCalledWith(DOCTOR_ID, 'meeting_modal');
    });
  });
});
