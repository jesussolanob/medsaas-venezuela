/**
 * IEmailPort — application-layer port (interface) for email delivery.
 *
 * Adapters (Resend / Noop) implement this interface so use-cases and controllers
 * remain completely decoupled from the email provider.
 *
 * Lives in application/ because it is the boundary the use-case depends on.
 * The concrete implementations live in infrastructure/adapters/.
 */
export interface EmailSendInput {
  /** One or more recipient email addresses. */
  to: string | string[];
  subject: string;
  /** HTML body (required). */
  html: string;
  /** Plain-text fallback (optional — Resend will generate one if omitted). */
  text?: string;
  /**
   * Override the sender address. Defaults to EMAIL_FROM env var.
   * Must be a verified domain in Resend (or onboarding@resend.dev in sandbox).
   */
  from?: string;
}

export interface EmailSendResult {
  /**
   * Provider-assigned message ID (e.g. Resend's `id` field).
   * `null` for the noop adapter.
   */
  id: string | null;
}

export interface IEmailPort {
  send(input: EmailSendInput): Promise<EmailSendResult>;
}

export const EMAIL_PORT = 'EMAIL_PORT' as const;
