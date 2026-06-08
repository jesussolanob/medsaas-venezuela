import { Injectable, Logger } from '@nestjs/common';
import type { IEmailPort, EmailSendInput, EmailSendResult } from '../../application/ports/email.port';

/**
 * NoopEmailAdapter — development / test stub.
 *
 * Logs that an email would have been sent (without the body or any PII
 * that could pollute logs) and returns `{ id: null }`.
 *
 * Activated when EMAIL_DRIVER=noop (or is not set).
 *
 * SECURITY:
 *   - Do NOT log `html`, `text`, or full recipient lists — these may contain PII.
 *   - Only the recipient count and subject are logged.
 */
@Injectable()
export class NoopEmailAdapter implements IEmailPort {
  private readonly logger = new Logger(NoopEmailAdapter.name);

  send(input: EmailSendInput): Promise<EmailSendResult> {
    const to = Array.isArray(input.to) ? input.to : [input.to];
    this.logger.log(`[email:noop] to=${to.length} recipient(s)`);
    return Promise.resolve({ id: null });
  }
}
