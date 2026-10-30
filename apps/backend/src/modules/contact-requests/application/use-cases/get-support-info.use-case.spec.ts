import { GetSupportInfoUseCase } from './get-support-info.use-case';
import type { IContactRequestRepository } from '../../domain/repositories/icontact-request.repository';

describe('GetSupportInfoUseCase', () => {
  let useCase: GetSupportInfoUseCase;
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
      findByIdWithDoctor: jest.fn(),
      countPending: jest.fn(),
      findAllSuperAdmins: jest.fn(),
      getSettings: jest.fn(),
    };
    useCase = new GetSupportInfoUseCase(mockRepo);
  });

  it('returns defaults when settings are empty', async () => {
    mockRepo.getSettings.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.whatsapp).toBe('584221033582');
    expect(result.supportHours.days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.supportHours.start).toBe('08:00');
    expect(result.supportHours.end).toBe('18:00');
    expect(result.supportHours.timezone).toBe('America/Caracas');
  });

  it('returns whatsapp from settings when present', async () => {
    mockRepo.getSettings.mockResolvedValue([
      { key: 'support_whatsapp_number', value: '584140000000' },
    ]);

    const result = await useCase.execute();

    expect(result.whatsapp).toBe('584140000000');
  });

  it('falls back to defaults when support_hours JSON is malformed', async () => {
    mockRepo.getSettings.mockResolvedValue([{ key: 'support_hours', value: 'not-valid-json' }]);

    const result = await useCase.execute();

    expect(result.supportHours.days).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('uses parsed support_hours from settings', async () => {
    const customHours = {
      days: [1, 2, 3, 4, 5],
      start: '09:00',
      end: '17:00',
      timezone: 'America/Caracas',
    };
    mockRepo.getSettings.mockResolvedValue([
      { key: 'support_hours', value: JSON.stringify(customHours) },
    ]);

    const result = await useCase.execute();

    expect(result.supportHours.start).toBe('09:00');
    expect(result.supportHours.end).toBe('17:00');
    expect(result.supportHours.days).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns a boolean for callNowAvailable', async () => {
    mockRepo.getSettings.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(typeof result.callNowAvailable).toBe('boolean');
  });
});
