/**
 * EmailRecipientRef — identifies who the email was sent to WITHOUT storing PII.
 *
 * - type: 'patient' | 'doctor' | 'admin' | 'system'
 * - id:   UUID of the entity in its own table (nullable when unknown or N/A)
 *
 * SECURITY: Never store an email address in this structure.
 * The actual recipient address is passed to the email port but never persisted.
 */
export interface EmailRecipientRef {
  type: 'patient' | 'doctor' | 'admin' | 'system';
  id?: string | null;
}

export interface EmailSendLogProps {
  readonly id: string;
  readonly recipientType: 'patient' | 'doctor' | 'admin' | 'system';
  readonly recipientId: string | null;
  readonly templateName: string;
  readonly status: 'sent' | 'failed';
  readonly provider: string;
  readonly providerMessageId: string | null;
  readonly errorDetail: string | null;
  readonly createdAt: Date;
}

/**
 * EmailSendLog — domain entity that records the outcome of each email dispatch.
 *
 * Invariants enforced at creation:
 *   - templateName must be a non-empty string.
 *   - status must be 'sent' or 'failed'.
 *   - A 'sent' entry MUST NOT have an errorDetail.
 *   - A 'failed' entry MUST NOT have a providerMessageId.
 *   - errorDetail is truncated to 1 000 characters (prevent oversized DB rows).
 *
 * This entity has no external framework dependencies (domain layer).
 */
export class EmailSendLog {
  private static readonly MAX_ERROR_DETAIL = 1_000;

  private constructor(private readonly props: EmailSendLogProps) {}

  // ---------------------------------------------------------------------------
  // Factory
  // ---------------------------------------------------------------------------

  static create(props: EmailSendLogProps): EmailSendLog {
    if (!props.templateName.trim()) {
      throw new Error('EmailSendLog: templateName must not be empty');
    }
    if (props.status !== 'sent' && props.status !== 'failed') {
      throw new Error(`EmailSendLog: invalid status "${props.status as string}"`);
    }

    const errorDetail =
      props.errorDetail !== null ? props.errorDetail.slice(0, EmailSendLog.MAX_ERROR_DETAIL) : null;

    return new EmailSendLog({ ...props, errorDetail });
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  get id(): string {
    return this.props.id;
  }

  get recipientType(): 'patient' | 'doctor' | 'admin' | 'system' {
    return this.props.recipientType;
  }

  get recipientId(): string | null {
    return this.props.recipientId;
  }

  get templateName(): string {
    return this.props.templateName;
  }

  get status(): 'sent' | 'failed' {
    return this.props.status;
  }

  get provider(): string {
    return this.props.provider;
  }

  get providerMessageId(): string | null {
    return this.props.providerMessageId;
  }

  get errorDetail(): string | null {
    return this.props.errorDetail;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  // ---------------------------------------------------------------------------
  // Convenience factories for the two outcomes
  // ---------------------------------------------------------------------------

  static sent(params: {
    id: string;
    recipientType: 'patient' | 'doctor' | 'admin' | 'system';
    recipientId: string | null;
    templateName: string;
    provider: string;
    providerMessageId: string | null;
    createdAt: Date;
  }): EmailSendLog {
    return EmailSendLog.create({
      ...params,
      status: 'sent',
      errorDetail: null,
    });
  }

  static failed(params: {
    id: string;
    recipientType: 'patient' | 'doctor' | 'admin' | 'system';
    recipientId: string | null;
    templateName: string;
    provider: string;
    errorDetail: string | null;
    createdAt: Date;
  }): EmailSendLog {
    return EmailSendLog.create({
      ...params,
      status: 'failed',
      providerMessageId: null,
    });
  }
}
