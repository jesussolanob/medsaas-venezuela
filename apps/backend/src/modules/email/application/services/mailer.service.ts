import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from '../../domain/repositories/email-template.repository';
import { EMAIL_PORT } from '../ports/email.port';
import type { IEmailPort, EmailSendResult } from '../ports/email.port';
import { EmailTemplateNotFoundError } from '../../domain/errors/email-template-not-found.error';

/**
 * MailerService — application-layer service for template-driven email delivery.
 *
 * Resolves a named template from the database, renders it by substituting
 * {{key}} placeholders with caller-provided data, and dispatches the result
 * via the injected IEmailPort.
 *
 * This service is exported from EmailModule so any other module that imports
 * EmailModule can inject it by class reference.
 *
 * SECURITY:
 *   - Never log the rendered HTML, subject, or recipient addresses.
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
  ) {}

  /**
   * Sends an email rendered from a stored template.
   *
   * @param name   Logical template key (e.g. 'invoice').
   * @param to     Recipient address(es).
   * @param data   Placeholder values. Keys must match {{key}} tokens in the template.
   *
   * @throws {EmailTemplateNotFoundError} when the template is missing or inactive.
   *
   * Email delivery errors propagate as-is (caller decides whether they are fatal).
   */
  async sendTemplate(
    name: string,
    to: string | string[],
    data: Record<string, unknown>,
  ): Promise<EmailSendResult> {
    const template = await this.templateRepo.findByName(name);

    if (!template) {
      throw new EmailTemplateNotFoundError(name);
    }

    const subject = this.render(template.subject, data);
    const html = this.render(template.html, data);
    const text = template.text !== null ? this.render(template.text, data) : undefined;

    this.logger.debug(`[mailer] sending template='${name}' to=${Array.isArray(to) ? to.length : 1} recipient(s)`);

    return this.emailPort.send({ to, subject, html, text });
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
}
