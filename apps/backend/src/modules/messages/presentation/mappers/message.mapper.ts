import type { Message } from '../../domain/entities/message.entity';
import type { ThreadSummary } from '../../domain/repositories/message.repository';

/**
 * Presentation-layer mapper for message data.
 *
 * PII POLICY (2026-06-09): All endpoints are owner-scoped (doctorId from the auth
 * token, never from the request body — anti-IDOR). Patient names are returned in
 * plaintext to the owning doctor. Masking has been removed.
 *
 * Message body is returned as plaintext because the doctor viewing their own thread
 * is the authorized owner. The repository decrypts before returning.
 */

export interface ThreadListItem {
  patientId: string;
  patientName: string;
  lastMessageAt: Date;
  unreadCount: number;
}

export interface MessageItem {
  id: string;
  doctorId: string;
  patientId: string;
  body: string;
  direction: string;
  readAt: Date | null;
  createdAt: Date;
}

/** Converts a thread summary to a list item with plaintext patient name. */
export function toThreadListItem(summary: ThreadSummary): ThreadListItem {
  return {
    patientId: summary.patientId,
    patientName: summary.patientName,
    lastMessageAt: summary.lastMessageAt,
    unreadCount: summary.unreadCount,
  };
}

/** Converts a domain message to a response DTO. Body is plaintext (authorized owner). */
export function toMessageItem(message: Message): MessageItem {
  return {
    id: message.id,
    doctorId: message.doctorId,
    patientId: message.patientId,
    body: message.body,
    direction: message.direction,
    readAt: message.readAt,
    createdAt: message.createdAt,
  };
}
