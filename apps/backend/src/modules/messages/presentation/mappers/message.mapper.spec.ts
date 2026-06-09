import { toThreadListItem, toMessageItem } from './message.mapper';
import { Message } from '../../domain/entities/message.entity';
import type { ThreadSummary } from '../../domain/repositories/message.repository';

const now = new Date('2026-06-05T00:00:00Z');

function makeThread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    patientId: 'pppppppp-0000-0000-0000-000000000001',
    patientName: 'Juan Pérez García',
    lastMessageAt: now,
    unreadCount: 2,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Parameters<typeof Message.create>[0]> = {}): Message {
  return Message.create({
    id: 'mmmmmmmm-0000-0000-0000-000000000001',
    doctorId: 'dddddddd-0000-0000-0000-000000000001',
    patientId: 'pppppppp-0000-0000-0000-000000000001',
    body: 'Hola doctor',
    direction: 'patient_to_doctor',
    readAt: null,
    createdAt: now,
    ...overrides,
  });
}

describe('message.mapper', () => {
  describe('toThreadListItem — plaintext patient name', () => {
    it('returns patientName in plain — no masking', () => {
      const item = toThreadListItem(makeThread());
      expect(item.patientName).toBe('Juan Pérez García');
      expect(item.patientName).not.toContain('***');
    });

    it('returns full name unchanged for single-word names', () => {
      const item = toThreadListItem(makeThread({ patientName: 'Juan' }));
      expect(item.patientName).toBe('Juan');
    });

    it('includes patientId, lastMessageAt, and unreadCount', () => {
      const summary = makeThread();
      const item = toThreadListItem(summary);
      expect(item.patientId).toBe(summary.patientId);
      expect(item.lastMessageAt).toBe(summary.lastMessageAt);
      expect(item.unreadCount).toBe(2);
    });

    it('handles zero unread count', () => {
      const item = toThreadListItem(makeThread({ unreadCount: 0 }));
      expect(item.unreadCount).toBe(0);
    });
  });

  describe('toMessageItem', () => {
    it('maps all message fields correctly', () => {
      const message = makeMessage();
      const item = toMessageItem(message);
      expect(item.id).toBe(message.id);
      expect(item.doctorId).toBe(message.doctorId);
      expect(item.patientId).toBe(message.patientId);
      expect(item.body).toBe('Hola doctor');
      expect(item.direction).toBe('patient_to_doctor');
      expect(item.readAt).toBeNull();
      expect(item.createdAt).toBe(message.createdAt);
    });

    it('includes readAt when set', () => {
      const readTime = new Date('2026-06-05T10:00:00Z');
      const item = toMessageItem(makeMessage({ readAt: readTime }));
      expect(item.readAt).toBe(readTime);
    });

    it('maps doctor_to_patient direction correctly', () => {
      const item = toMessageItem(makeMessage({ direction: 'doctor_to_patient' }));
      expect(item.direction).toBe('doctor_to_patient');
    });
  });
});
