import type { ReminderChannelValue } from '../value-objects/reminder-channel.vo';

export type ReminderQueueStatus = 'pending' | 'sent' | 'failed' | 'skipped' | 'cancelled';

export const REMINDER_QUEUE_STATUSES: ReminderQueueStatus[] = [
  'pending',
  'sent',
  'failed',
  'skipped',
  'cancelled',
];

export interface ReminderQueueItemCreateParams {
  id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string | null;
  offsetType: string;
  scheduledFor: Date;
  channel: ReminderChannelValue;
  messageBody: string | null;
  status: ReminderQueueStatus;
  attempts: number;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

/**
 * ReminderQueueItem domain entity.
 *
 * Represents a scheduled reminder in the queue. In Etapa 1 this is read-only;
 * sending is deferred to Fase 6 (WhatsApp/email integration).
 *
 * Invariants:
 *   - isOwnedByDoctor() enforces doctor ownership — used for anti-IDOR checks.
 *   - isPending() / isSent() are convenience state checks.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */
export class ReminderQueueItem {
  readonly id: string;
  readonly appointmentId: string;
  readonly doctorId: string;
  readonly patientId: string | null;
  readonly offsetType: string;
  readonly scheduledFor: Date;
  readonly channel: ReminderChannelValue;
  readonly messageBody: string | null;
  readonly status: ReminderQueueStatus;
  readonly attempts: number;
  readonly lastAttemptAt: Date | null;
  readonly sentAt: Date | null;
  readonly errorMessage: string | null;
  readonly createdAt: Date;

  constructor(params: ReminderQueueItemCreateParams) {
    this.id = params.id;
    this.appointmentId = params.appointmentId;
    this.doctorId = params.doctorId;
    this.patientId = params.patientId;
    this.offsetType = params.offsetType;
    this.scheduledFor = params.scheduledFor;
    this.channel = params.channel;
    this.messageBody = params.messageBody;
    this.status = params.status;
    this.attempts = params.attempts;
    this.lastAttemptAt = params.lastAttemptAt;
    this.sentAt = params.sentAt;
    this.errorMessage = params.errorMessage;
    this.createdAt = params.createdAt;
  }

  /** Returns true when the given doctorId owns this queue item. Anti-IDOR guard. */
  isOwnedByDoctor(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  isPending(): boolean {
    return this.status === 'pending';
  }

  isSent(): boolean {
    return this.status === 'sent';
  }

  isFailed(): boolean {
    return this.status === 'failed';
  }

  /** Factory — creates a ReminderQueueItem from raw params. Does not persist. */
  static create(params: ReminderQueueItemCreateParams): ReminderQueueItem {
    return new ReminderQueueItem(params);
  }
}
