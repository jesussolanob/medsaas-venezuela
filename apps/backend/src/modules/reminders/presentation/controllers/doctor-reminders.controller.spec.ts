import { Test, type TestingModule } from '@nestjs/testing';
import { DoctorRemindersController } from './doctor-reminders.controller';
import { GetRemindersSettingsUseCase } from '../../application/use-cases/reminders/get-reminders-settings.use-case';
import { UpsertRemindersSettingsUseCase } from '../../application/use-cases/reminders/upsert-reminders-settings.use-case';
import { GetDoctorRemindersQueueUseCase } from '../../application/use-cases/reminders/get-doctor-reminders-queue.use-case';
import { ReminderSettings, REMINDERS_SETTINGS_DEFAULTS } from '../../domain/entities/reminders-settings.entity';
import { ReminderQueueItem } from '../../domain/entities/reminder-queue-item.entity';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const mockUser: CurrentUserPayload = {
  sub: 'doctor-1',
  role: 'doctor',
  email: 'doctor-1@dev.local',
};

const buildDefaultSettings = (): ReminderSettings =>
  ReminderSettings.defaults('doctor-1');

const buildQueueItem = (): ReminderQueueItem =>
  ReminderQueueItem.create({
    id: 'item-1',
    appointmentId: 'appt-1',
    doctorId: 'doctor-1',
    patientId: null,
    offsetType: '24h',
    scheduledFor: new Date('2025-02-01T10:00:00Z'),
    channel: 'whatsapp',
    messageBody: null,
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    sentAt: null,
    errorMessage: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
  });

describe('DoctorRemindersController', () => {
  let controller: DoctorRemindersController;
  let mockGetSettings: jest.Mocked<GetRemindersSettingsUseCase>;
  let mockUpsertSettings: jest.Mocked<UpsertRemindersSettingsUseCase>;
  let mockGetQueue: jest.Mocked<GetDoctorRemindersQueueUseCase>;

  beforeEach(async () => {
    mockGetSettings = { execute: jest.fn() } as unknown as jest.Mocked<GetRemindersSettingsUseCase>;
    mockUpsertSettings = { execute: jest.fn() } as unknown as jest.Mocked<UpsertRemindersSettingsUseCase>;
    mockGetQueue = { execute: jest.fn() } as unknown as jest.Mocked<GetDoctorRemindersQueueUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorRemindersController],
      providers: [
        { provide: GetRemindersSettingsUseCase, useValue: mockGetSettings },
        { provide: UpsertRemindersSettingsUseCase, useValue: mockUpsertSettings },
        { provide: GetDoctorRemindersQueueUseCase, useValue: mockGetQueue },
      ],
    })
      .overrideGuard(DevAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DoctorRemindersController>(DoctorRemindersController);
  });

  describe('getRemindersSettings', () => {
    it('returns default settings when none exist', async () => {
      const defaults = buildDefaultSettings();
      mockGetSettings.execute.mockResolvedValue(defaults);

      const result = await controller.getRemindersSettings(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toBe(defaults);
      expect(mockGetSettings.execute).toHaveBeenCalledWith('doctor-1');
    });

    it('returns persisted settings when they exist', async () => {
      const settings = ReminderSettings.create({
        id: 'settings-1',
        doctorId: 'doctor-1',
        enabled: false,
        channel: 'email',
        reminder7dEnabled: true,
        reminder24hEnabled: false,
        reminder3hEnabled: true,
        reminder1hEnabled: false,
        template7dWhatsapp: 'Custom',
        template24hWhatsapp: 'Custom 24h',
        template3hWhatsapp: 'Custom 3h',
        quietHoursStart: '21:00:00',
        quietHoursEnd: '08:00:00',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockGetSettings.execute.mockResolvedValue(settings);

      const result = await controller.getRemindersSettings(mockUser);

      expect(result.success).toBe(true);
      expect(result.data.enabled).toBe(false);
    });
  });

  describe('upsertRemindersSettings', () => {
    it('returns updated settings', async () => {
      const defaults = buildDefaultSettings();
      const updated = defaults.withUpdates({ enabled: false });
      mockUpsertSettings.execute.mockResolvedValue(updated);

      const result = await controller.upsertRemindersSettings({ enabled: false }, mockUser);

      expect(result.success).toBe(true);
      expect(result.data.enabled).toBe(false);
      expect(mockUpsertSettings.execute).toHaveBeenCalledWith('doctor-1', { enabled: false });
    });

    it('uses doctorId from user.sub (anti-IDOR)', async () => {
      const defaults = buildDefaultSettings();
      mockUpsertSettings.execute.mockResolvedValue(defaults);

      await controller.upsertRemindersSettings({}, mockUser);

      expect(mockUpsertSettings.execute).toHaveBeenCalledWith('doctor-1', {});
    });
  });

  describe('getDoctorQueue', () => {
    it('returns empty array when queue is empty', async () => {
      mockGetQueue.execute.mockResolvedValue([]);

      const result = await controller.getDoctorRemindersQueue(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(mockGetQueue.execute).toHaveBeenCalledWith('doctor-1');
    });

    it('returns queue items', async () => {
      const items = [buildQueueItem()];
      mockGetQueue.execute.mockResolvedValue(items);

      const result = await controller.getDoctorRemindersQueue(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.id).toBe('item-1');
    });
  });

  describe('anti-IDOR — settings scoped to user.sub', () => {
    it('always uses user.sub as doctorId even when called with different context', async () => {
      mockGetSettings.execute.mockResolvedValue(buildDefaultSettings());
      const anotherUser: CurrentUserPayload = { sub: 'doctor-2', role: 'doctor', email: 'x@dev.local' };

      await controller.getRemindersSettings(anotherUser);

      expect(mockGetSettings.execute).toHaveBeenCalledWith('doctor-2');
      // doctor-2 gets their own defaults, not doctor-1's
      expect(mockGetSettings.execute).not.toHaveBeenCalledWith('doctor-1');
    });
  });

  describe('REMINDERS_SETTINGS_DEFAULTS sanity', () => {
    it('defaults has expected shape', () => {
      expect(REMINDERS_SETTINGS_DEFAULTS.enabled).toBe(true);
      expect(REMINDERS_SETTINGS_DEFAULTS.channel).toBe('both');
      expect(REMINDERS_SETTINGS_DEFAULTS.reminder1hEnabled).toBe(false);
    });
  });
});
