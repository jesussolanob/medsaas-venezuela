import { GetDoctorRemindersQueueUseCase } from './get-doctor-reminders-queue.use-case';
import { ReminderQueueItem } from '../../../domain/entities/reminder-queue-item.entity';
import type { IRemindersQueueRepository } from '../../../domain/repositories/reminders-queue.repository';

const buildItem = (id: string, doctorId: string): ReminderQueueItem =>
  ReminderQueueItem.create({
    id,
    appointmentId: 'appt-1',
    doctorId,
    patientId: 'patient-1',
    offsetType: '24h',
    scheduledFor: new Date('2025-01-15T10:00:00Z'),
    channel: 'whatsapp',
    messageBody: 'Test',
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    sentAt: null,
    errorMessage: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
  });

describe('GetDoctorRemindersQueueUseCase', () => {
  let useCase: GetDoctorRemindersQueueUseCase;
  let mockRepo: jest.Mocked<IRemindersQueueRepository>;

  beforeEach(() => {
    mockRepo = {
      listByDoctorId: jest.fn(),
      listAll: jest.fn(),
      findDueForReminder: jest.fn(),
      insertPending: jest.fn(),
      markSent: jest.fn(),
      markFailed: jest.fn(),
    };
    useCase = new GetDoctorRemindersQueueUseCase(mockRepo);
  });

  it('returns queue items for the doctor', async () => {
    const items = [buildItem('item-1', 'doctor-1'), buildItem('item-2', 'doctor-1')];
    mockRepo.listByDoctorId.mockResolvedValue(items);

    const result = await useCase.execute('doctor-1');

    expect(mockRepo.listByDoctorId).toHaveBeenCalledWith('doctor-1');
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('item-1');
  });

  it('returns empty array when no items exist', async () => {
    mockRepo.listByDoctorId.mockResolvedValue([]);

    const result = await useCase.execute('doctor-2');

    expect(result).toEqual([]);
    expect(mockRepo.listByDoctorId).toHaveBeenCalledWith('doctor-2');
  });
});
