import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from '../../domain/repositories/email-template.repository';
import {
  EMAIL_SEND_LOG_REPOSITORY,
  type IEmailSendLogRepository,
} from '../../domain/repositories/email-send-log.repository';
import { EMAIL_PORT } from '../ports/email.port';
import type { IEmailPort, EmailSendResult } from '../ports/email.port';
import { EmailTemplateNotFoundError } from '../../domain/errors/email-template-not-found.error';
import { EmailSendLog, type EmailRecipientRef } from '../../domain/entities/email-send-log.entity';

export type { EmailRecipientRef };

/**
 * MailerService — application-layer service for template-driven email delivery.
 *
 * Resolves a named template from the database, renders it by substituting
 * {{key}} placeholders with caller-provided data, and dispatches the result
 * via the injected IEmailPort.
 *
 * Every dispatch attempt (success or failure) is recorded in `email_send_log`
 * via IEmailSendLogRepository. The log write is DEFENSIVE: if it fails the
 * original send result / error is still returned/thrown unchanged.
 *
 * This service is exported from EmailModule so any other module that imports
 * EmailModule can inject it by class reference.
 *
 * SECURITY:
 *   - Never log the rendered HTML, subject, or recipient addresses.
 *   - Never log `recipient` ref details beyond type and id (no PII).
 *   - Data values are serialised to string but NOT HTML-escaped — all data
 *     is provided by the backend itself (not user-controlled HTML input).
 *   - If a placeholder key is absent from `data`, it is replaced with an
 *     empty string (fail-safe; never expose raw template tokens to the user).
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
    @Inject(EMAIL_PORT)
    private readonly emailPort: IEmailPort,
    @Inject(EMAIL_SEND_LOG_REPOSITORY)
    private readonly sendLogRepo: IEmailSendLogRepository,
    private readonly config: ConfigService,
  ) {}

  /**
   * Sends an email rendered from a stored template and records the outcome.
   *
   * @param name      Logical template key (e.g. 'invoice').
   * @param to        Recipient address(es).
   * @param data      Placeholder values. Keys must match {{key}} tokens in the template.
   * @param recipient Optional typed reference to the recipient entity (no PII).
   *                  Used only for logging — never stored as email/name.
   *
   * @throws {EmailTemplateNotFoundError} when the template is missing or inactive.
   *
   * Email delivery errors propagate as-is (caller decides whether they are fatal).
   */
  async sendTemplate(
    name: string,
    to: string | string[],
    data: Record<string, unknown>,
    recipient?: EmailRecipientRef,
  ): Promise<EmailSendResult> {
    // Resolve context variables first so they are available for the not-found
    // log entry as well as the normal send path.
    const recipientType = recipient?.type ?? 'system';
    const recipientId = recipient?.id ?? null;
    const provider = this.config.get<string>('EMAIL_DRIVER') ?? 'noop';

    const template = await this.templateRepo.findByName(name);

    if (!template) {
      // Record the missing-template event so it is visible in email_send_log
      // and does not silently disappear.
      await this.safeRecord(
        EmailSendLog.failed({
          id: randomUUID(),
          recipientType,
          recipientId,
          templateName: name,
          provider,
          errorDetail: 'template_not_found',
          createdAt: new Date(),
        }),
      );
      throw new EmailTemplateNotFoundError(name);
    }

    const subject = this.render(template.subject, data);
    const html = this.render(template.html, data);
    const text = template.text !== null ? this.render(template.text, data) : undefined;

    this.logger.debug(
      `[mailer] sending template='${name}' to=${Array.isArray(to) ? to.length : 1} recipient(s)`,
    );

    let result: EmailSendResult;
    try {
      result = await this.emailPort.send({ to, subject, html, text });
    } catch (sendError: unknown) {
      // Record failure log — DEFENSIVE: log write must never shadow the original error.
      await this.safeRecord(
        EmailSendLog.failed({
          id: randomUUID(),
          recipientType,
          recipientId,
          templateName: name,
          provider,
          errorDetail: sendError instanceof Error ? sendError.message : String(sendError),
          createdAt: new Date(),
        }),
      );
      throw sendError;
    }

    // Record success log — DEFENSIVE.
    await this.safeRecord(
      EmailSendLog.sent({
        id: randomUUID(),
        recipientType,
        recipientId,
        templateName: name,
        provider,
        providerMessageId: result.id,
        createdAt: new Date(),
      }),
    );

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Replaces all {{key}} occurrences in `template` with the corresponding
   * value from `data`.
   *
   * - Unknown keys → empty string (never expose raw tokens).
   * - Non-string values are serialised via String() (numbers, dates, etc.).
   */
  private render(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = data[key];
      if (value === undefined || value === null) {
        return '';
      }
      return String(value);
    });
  }

  /**
   * Writes a log entry without ever throwing.
   * If the repository fails, a warning is emitted and execution continues.
   */
  private async safeRecord(entry: EmailSendLog): Promise<void> {
    try {
      await this.sendLogRepo.record(entry);
    } catch (logError: unknown) {
      const msg = logError instanceof Error ? logError.message : String(logError);
      this.logger.warn(
        `[mailer] failed to write send log for template='${entry.templateName}': ${msg}`,
      );
    }
  }
}
