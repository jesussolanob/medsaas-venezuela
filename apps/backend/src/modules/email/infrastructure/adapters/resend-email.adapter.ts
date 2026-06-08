import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { IEmailPort, EmailSendInput, EmailSendResult } from '../../application/ports/email.port';
import { EmailSendError } from '../../domain/errors/email.error';

/**
 * ResendEmailAdapter — production / development email adapter backed by Resend.
 *
 * Activated when EMAIL_DRIVER=resend.
 *
 * IMPORTANT: In Resend's sandbox (onboarding@resend.dev), delivery only reaches
 * the account owner's email. For all other recipients Resend returns a controlled
 * error — this adapter catches that and throws EmailSendError (HTTP 502).
 *
 * SECURITY:
 *   - API key is read from ConfigService at runtime (never at module-init time)
 *     so a missing key produces a runtime warning, not a boot crash.
 *   - Do NOT log email body, html, or recipient addresses — they may contain PII.
 *   - Only the subject and recipient count are logged at debug level.
 */
@Injectable()
export class ResendEmailAdapter implements IEmailPort {
  private readonly logger = new Logger(ResendEmailAdapter.name);
  private readonly defaultFrom: string;
  private resendClient: Resend | null = null;

  constructor(private readonly config: ConfigService) {
    this.defaultFrom = this.config.get<string>('EMAIL_FROM', 'onboarding@resend.dev');

    const apiKey = this.config.get<string>('RESEND_API_KEY', '');

    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY is not set. Email delivery will fail at runtime.',
      );
    } else {
      this.resendClient = new Resend(apiKey);
    }
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    if (!this.resendClient) {
      throw new EmailSendError('RESEND_API_KEY is not configured');
    }

    const from = input.from ?? this.defaultFrom;
    const to = Array.isArray(input.to) ? input.to : [input.to];

    this.logger.debug(
      `[email:resend] sending to=${to.length} recipient(s) subject="${input.subject}"`,
    );

    const { data, error } = await this.resendClient.emails.send({
      from,
      to,
      subject: input.subject,
      html: input.html,
      ...(input.text !== undefined ? { text: input.text } : {}),
    });

    if (error) {
      this.logger.warn(
        `[email:resend] delivery failed — code=${error.name} status=${error.statusCode ?? 'unknown'}`,
      );
      throw new EmailSendError(error.message);
    }

    this.logger.debug(`[email:resend] sent id=${data?.id ?? 'unknown'}`);
    return { id: data?.id ?? null };
  }
}
