import { GetRemindersSettingsUseCase } from './get-reminders-settings.use-case';
import { ReminderSettings, REMINDERS_SETTINGS_DEFAULTS } from '../../../domain/entities/reminders-settings.entity';
import type { IRemindersSettingsRepository } from '../../../domain/repositories/reminders-settings.repository';

const buildSettings = (doctorId: string): ReminderSettings =>
  ReminderSettings.create({
    id: 'settings-1',
    doctorId,
    enabled: false,
    channel: 'email',
    reminder7dEnabled: true,
    reminder24hEnabled: false,
    reminder3hEnabled: true,
    reminder1hEnabled: false,
    template7dWhatsapp: 'Custom 7d',
    template24hWhatsapp: 'Custom 24h',
    template3hWhatsapp: 'Custom 3h',
    quietHoursStart: '22:00:00',
    quietHoursEnd: '07:00:00',
    createdAt: new Date('2024-06-01T00:00:00Z'),
    updatedAt: new Date('2024-06-01T00:00:00Z'),
  });

describe('GetRemindersSettingsUseCase', () => {
  let useCase: GetRemindersSettingsUseCase;
  let mockRepo: jest.Mocked<IRemindersSettingsRepository>;

  beforeEach(() => {
    mockRepo = {
      findByDoctorId: jest.fn(),
      upsert: jest.fn(),
    };
    useCase = new GetRemindersSettingsUseCase(mockRepo);
  });

  it('returns existing settings when found', async () => {
    const settings = buildSettings('doctor-1');
    mockRepo.findByDoctorId.mockResolvedValue(settings);

    const result = await useCase.execute('doctor-1');

    expect(mockRepo.findByDoctorId).toHaveBeenCalledWith('doctor-1');
    expect(result).toBe(settings);
    expect(result.enabled).toBe(false);
    expect(result.channel).toBe('email');
  });

  it('returns default settings when no row exists', async () => {
    mockRepo.findByDoctorId.mockResolvedValue(null);

    const result = await useCase.execute('doctor-2');

    expect(mockRepo.findByDoctorId).toHaveBeenCalledWith('doctor-2');
    expect(result.id).toBe('');
    expect(result.doctorId).toBe('doctor-2');
    expect(result.enabled).toBe(REMINDERS_SETTINGS_DEFAULTS.enabled);
    expect(result.channel).toBe(REMINDERS_SETTINGS_DEFAULTS.channel);
    expect(result.reminder7dEnabled).toBe(REMINDERS_SETTINGS_DEFAULTS.reminder7dEnabled);
    expect(result.reminder1hEnabled).toBe(REMINDERS_SETTINGS_DEFAULTS.reminder1hEnabled);
  });
});
