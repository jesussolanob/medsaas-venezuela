import { GetAdminRemindersQueueUseCase } from './get-admin-reminders-queue.use-case';
import { ReminderQueueItem } from '../../../domain/entities/reminder-queue-item.entity';
import type { IRemindersQueueRepository } from '../../../domain/repositories/reminders-queue.repository';

const buildItemWithDoctorName = (
  id: string,
  doctorName: string,
): ReminderQueueItem & { doctorName: string } => {
  const item = ReminderQueueItem.create({
    id,
    appointmentId: 'appt-1',
    doctorId: 'doctor-1',
    patientId: null,
    offsetType: '7d',
    scheduledFor: new Date('2025-02-01T09:00:00Z'),
    channel: 'both',
    messageBody: null,
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    sentAt: null,
    errorMessage: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
  });
  return Object.assign(item, { doctorName });
};

describe('GetAdminRemindersQueueUseCase', () => {
  let useCase: GetAdminRemindersQueueUseCase;
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
    useCase = new GetAdminRemindersQueueUseCase(mockRepo);
  });

  it('returns enriched queue rows', async () => {
    const items = [buildItemWithDoctorName('item-1', 'Dr. García')];
    mockRepo.listAll.mockResolvedValue(items);

    const result = await useCase.execute();

    expect(mockRepo.listAll).toHaveBeenCalledWith(50);
    expect(result).toHaveLength(1);
    const first = result[0]!;
    expect(first.id).toBe('item-1');
    expect(first.doctorName).toBe('Dr. García');
    expect(first.offsetType).toBe('7d');
    expect(first.channel).toBe('both');
    expect(first.status).toBe('pending');
  });

  it('returns empty array when queue is empty', async () => {
    mockRepo.listAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });

  it('falls back to doctorId when doctorName is missing', async () => {
    const item = ReminderQueueItem.create({
      id: 'item-2',
      appointmentId: 'appt-2',
      doctorId: 'doctor-xyz',
      patientId: null,
      offsetType: '1h',
      scheduledFor: new Date('2025-02-01T09:00:00Z'),
      channel: 'email',
      messageBody: null,
      status: 'pending',
      attempts: 0,
      lastAttemptAt: null,
      sentAt: null,
      errorMessage: null,
      createdAt: new Date(),
    });
    mockRepo.listAll.mockResolvedValue([item]);

    const result = await useCase.execute();

    expect(result[0]!.doctorName).toBe('doctor-xyz');
  });
});
