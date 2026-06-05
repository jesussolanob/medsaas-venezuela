import type { Message } from '../../domain/entities/message.entity';
import type { ThreadSummary } from '../../domain/repositories/message.repository';

/**
 * Presentation-layer mapper for message data.
 *
 * MASKING RULE: PII masking of patient names happens here — never in the
 * repository or use cases. The repository resolves and decrypts full names;
 * this mapper reduces them to "Juan P." format for list responses.
 *
 * Body is returned as plaintext because the doctor viewing their own thread
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

/** Converts a thread summary to a masked list item. */
export function toThreadListItem(summary: ThreadSummary): ThreadListItem {
  return {
    patientId: summary.patientId,
    patientName: maskName(summary.patientName),
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

// ---------------------------------------------------------------------------
// Masking helpers
// ---------------------------------------------------------------------------

function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? name;
  const lastPart = parts.length > 1 ? parts[parts.length - 1] : undefined;
  const lastInitial = lastPart ? ` ${lastPart[0]}.` : '';
  return `${first}${lastInitial}`;
}
