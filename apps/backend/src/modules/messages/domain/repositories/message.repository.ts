import type { Message } from '../entities/message.entity';

export const MESSAGE_REPOSITORY = Symbol('IMessageRepository');

export interface ThreadSummary {
  patientId: string;
  /** Masked patient name, e.g. "Juan P." — masking applied in presentation layer, not here. */
  patientName: string;
  lastMessageAt: Date;
  unreadCount: number;
}

export interface IMessageRepository {
  /**
   * Returns all message threads for a doctor.
   * Each thread is represented by the most recent message per patient,
   * along with unread count (patient_to_doctor messages with read_at IS NULL).
   *
   * IMPORTANT: patientName is resolved and decrypted by the repo using
   * the patient repository. The presentation layer applies masking.
   */
  listThreads(doctorId: string): Promise<ThreadSummary[]>;

  /**
   * Returns all messages in a thread between a doctor and a patient,
   * ordered by created_at ASC (chronological).
   *
   * Returns an empty array when no messages exist (the patient ownership
   * check must be done at the use-case level before calling this).
   */
  findThread(doctorId: string, patientId: string): Promise<Message[]>;

  /**
   * Marks all patient_to_doctor messages in the given thread as read.
   * Sets read_at = now() for rows where read_at IS NULL.
   */
  markThreadRead(doctorId: string, patientId: string): Promise<void>;

  /**
   * Persists a new message. Body must already be plaintext — encryption
   * happens inside this method before writing to the DB.
   */
  save(message: Message): Promise<Message>;
}
