import { UpsertRemindersSettingsUseCase } from './upsert-reminders-settings.use-case';
import { ReminderSettings, REMINDERS_SETTINGS_DEFAULTS } from '../../../domain/entities/reminders-settings.entity';
import { ReminderSettingsInvalidChannelError } from '../../../domain/errors/reminders-settings-invalid-channel.error';
import type { IRemindersSettingsRepository } from '../../../domain/repositories/reminders-settings.repository';
import type { UpsertRemindersSettingsDto } from '@delta/shared-types';

const buildExistingSettings = (): ReminderSettings =>
  ReminderSettings.create({
    id: 'settings-1',
    doctorId: 'doctor-1',
    enabled: true,
    channel: 'both',
    reminder7dEnabled: true,
    reminder24hEnabled: true,
    reminder3hEnabled: true,
    reminder1hEnabled: false,
    template7dWhatsapp: 'Existing 7d',
    template24hWhatsapp: 'Existing 24h',
    template3hWhatsapp: 'Existing 3h',
    quietHoursStart: '21:00:00',
    quietHoursEnd: '08:00:00',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  });

describe('UpsertRemindersSettingsUseCase', () => {
  let useCase: UpsertRemindersSettingsUseCase;
  let mockRepo: jest.Mocked<IRemindersSettingsRepository>;

  beforeEach(() => {
    mockRepo = {
      findByDoctorId: jest.fn(),
      upsert: jest.fn(),
    };
    useCase = new UpsertRemindersSettingsUseCase(mockRepo);
  });

  it('updates existing settings with provided fields', async () => {
    const existing = buildExistingSettings();
    mockRepo.findByDoctorId.mockResolvedValue(existing);
    mockRepo.upsert.mockImplementation(async (s) => s);

    const dto: UpsertRemindersSettingsDto = { enabled: false, channel: 'email' };
    const result = await useCase.execute('doctor-1', dto);

    expect(result.enabled).toBe(false);
    expect(result.channel).toBe('email');
    expect(result.id).toBe('settings-1'); // existing id preserved
    expect(mockRepo.upsert).toHaveBeenCalledTimes(1);
  });

  it('creates settings from defaults when no row exists', async () => {
    mockRepo.findByDoctorId.mockResolvedValue(null);
    mockRepo.upsert.mockImplementation(async (s) => s);

    const dto: UpsertRemindersSettingsDto = { enabled: false };
    const result = await useCase.execute('doctor-new', dto);

    expect(result.doctorId).toBe('doctor-new');
    expect(result.enabled).toBe(false);
    expect(result.channel).toBe(REMINDERS_SETTINGS_DEFAULTS.channel);
    expect(result.id).not.toBe(''); // new UUID assigned
    expect(mockRepo.upsert).toHaveBeenCalledTimes(1);
  });

  it('preserves unset fields from existing settings', async () => {
    const existing = buildExistingSettings();
    mockRepo.findByDoctorId.mockResolvedValue(existing);
    mockRepo.upsert.mockImplementation(async (s) => s);

    const dto: UpsertRemindersSettingsDto = { reminder_1h_enabled: true };
    const result = await useCase.execute('doctor-1', dto);

    expect(result.reminder1hEnabled).toBe(true);
    expect(result.reminder7dEnabled).toBe(existing.reminder7dEnabled);
    expect(result.template7dWhatsapp).toBe(existing.template7dWhatsapp);
    expect(result.quietHoursStart).toBe(existing.quietHoursStart);
  });

  it('throws ReminderSettingsInvalidChannelError for invalid channel', async () => {
    mockRepo.findByDoctorId.mockResolvedValue(null);
    const dto = { channel: 'sms' } as unknown as UpsertRemindersSettingsDto;
    await expect(useCase.execute('doctor-1', dto)).rejects.toThrow(
      ReminderSettingsInvalidChannelError,
    );
    expect(mockRepo.upsert).not.toHaveBeenCalled();
  });

  it('accepts whatsapp channel', async () => {
    mockRepo.findByDoctorId.mockResolvedValue(buildExistingSettings());
    mockRepo.upsert.mockImplementation(async (s) => s);

    const result = await useCase.execute('doctor-1', { channel: 'whatsapp' });
    expect(result.channel).toBe('whatsapp');
  });

  it('accepts both channel', async () => {
    const existing = buildExistingSettings();
    existing.withUpdates({ channel: 'email' });
    mockRepo.findByDoctorId.mockResolvedValue(existing);
    mockRepo.upsert.mockImplementation(async (s) => s);

    const result = await useCase.execute('doctor-1', { channel: 'both' });
    expect(result.channel).toBe('both');
  });

  it('updates quiet hours when provided', async () => {
    mockRepo.findByDoctorId.mockResolvedValue(buildExistingSettings());
    mockRepo.upsert.mockImplementation(async (s) => s);

    const result = await useCase.execute('doctor-1', {
      quiet_hours_start: '22:00:00',
      quiet_hours_end: '07:00:00',
    });
    expect(result.quietHoursStart).toBe('22:00:00');
    expect(result.quietHoursEnd).toBe('07:00:00');
  });
});
