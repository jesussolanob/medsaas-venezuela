import { ReminderQueueItem } from './reminder-queue-item.entity';
import type { ReminderQueueItemCreateParams } from './reminder-queue-item.entity';

const baseParams: ReminderQueueItemCreateParams = {
  id: 'queue-item-1',
  appointmentId: 'appointment-1',
  doctorId: 'doctor-1',
  patientId: 'patient-1',
  offsetType: '24h',
  scheduledFor: new Date('2025-01-15T10:00:00Z'),
  channel: 'whatsapp',
  messageBody: 'Test message',
  status: 'pending',
  attempts: 0,
  lastAttemptAt: null,
  sentAt: null,
  errorMessage: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
};

describe('ReminderQueueItem entity', () => {
  describe('constructor / create', () => {
    it('creates entity with provided params', () => {
      const item = ReminderQueueItem.create(baseParams);
      expect(item.id).toBe('queue-item-1');
      expect(item.appointmentId).toBe('appointment-1');
      expect(item.doctorId).toBe('doctor-1');
      expect(item.patientId).toBe('patient-1');
      expect(item.offsetType).toBe('24h');
      expect(item.channel).toBe('whatsapp');
      expect(item.messageBody).toBe('Test message');
      expect(item.status).toBe('pending');
      expect(item.attempts).toBe(0);
      expect(item.lastAttemptAt).toBeNull();
      expect(item.sentAt).toBeNull();
      expect(item.errorMessage).toBeNull();
    });

    it('creates entity with null patientId', () => {
      const item = ReminderQueueItem.create({ ...baseParams, patientId: null });
      expect(item.patientId).toBeNull();
    });
  });

  describe('isOwnedByDoctor', () => {
    it('returns true when doctorId matches', () => {
      const item = ReminderQueueItem.create(baseParams);
      expect(item.isOwnedByDoctor('doctor-1')).toBe(true);
    });

    it('returns false when doctorId differs', () => {
      const item = ReminderQueueItem.create(baseParams);
      expect(item.isOwnedByDoctor('doctor-2')).toBe(false);
    });
  });

  describe('status helpers', () => {
    it('isPending returns true for pending status', () => {
      const item = ReminderQueueItem.create({ ...baseParams, status: 'pending' });
      expect(item.isPending()).toBe(true);
      expect(item.isSent()).toBe(false);
      expect(item.isFailed()).toBe(false);
    });

    it('isSent returns true for sent status', () => {
      const item = ReminderQueueItem.create({ ...baseParams, status: 'sent' });
      expect(item.isSent()).toBe(true);
      expect(item.isPending()).toBe(false);
      expect(item.isFailed()).toBe(false);
    });

    it('isFailed returns true for failed status', () => {
      const item = ReminderQueueItem.create({ ...baseParams, status: 'failed' });
      expect(item.isFailed()).toBe(true);
      expect(item.isPending()).toBe(false);
      expect(item.isSent()).toBe(false);
    });

    it('handles skipped status', () => {
      const item = ReminderQueueItem.create({ ...baseParams, status: 'skipped' });
      expect(item.isPending()).toBe(false);
      expect(item.isSent()).toBe(false);
      expect(item.isFailed()).toBe(false);
    });

    it('handles cancelled status', () => {
      const item = ReminderQueueItem.create({ ...baseParams, status: 'cancelled' });
      expect(item.isPending()).toBe(false);
      expect(item.isSent()).toBe(false);
      expect(item.isFailed()).toBe(false);
    });
  });
});
