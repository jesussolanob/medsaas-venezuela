import type { EmailSendLog } from '../entities/email-send-log.entity';

export const EMAIL_SEND_LOG_REPOSITORY = 'EMAIL_SEND_LOG_REPOSITORY' as const;

/**
 * IEmailSendLogRepository — write-only repository for email send logs.
 *
 * This interface lives in the domain layer and has no framework dependencies.
 * The infrastructure layer provides the Sequelize-backed implementation.
 *
 * SECURITY: The entity NEVER contains an email address — only a typed
 * reference (recipientType + recipientId) to the entity in its own table.
 */
export interface IEmailSendLogRepository {
  /**
   * Persists an email send log entry.
   * Implementations MUST NOT throw on conflict (INSERT … ON CONFLICT IGNORE
   * or equivalent) so a duplicate log cannot break the calling flow.
   */
  record(entry: EmailSendLog): Promise<void>;
}
