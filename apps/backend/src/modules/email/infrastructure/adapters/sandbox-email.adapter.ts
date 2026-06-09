import { Logger } from '@nestjs/common';
import type { IEmailPort, EmailSendInput, EmailSendResult } from '../../application/ports/email.port';

/**
 * SandboxEmailPort — decorator (wrapper) that sits in front of the real adapter
 * and intercepts all outbound email calls based on two env vars:
 *
 *   SANDBOX=true              → Suppress all delivery (return { id: null }).
 *   SANDBOX=false + SANDBOX_EMAIL set → Redirect every recipient to SANDBOX_EMAIL.
 *   SANDBOX=false + SANDBOX_EMAIL absent → Pass through to the real adapter unchanged.
 *
 * This class owns the single source of truth for sandbox/redirect logic, which
 * means MailerService AND the /api/email/test endpoint automatically obey it
 * because both consume the EMAIL_PORT token, which always resolves to this wrapper.
 *
 * SECURITY:
 *   - Never log the original `to` address — it may be doctor PII.
 *   - Log only recipient count and whether delivery was suppressed/redirected.
 */
export class SandboxEmailPort implements IEmailPort {
  private readonly logger = new Logger(SandboxEmailPort.name);

  private readonly sandboxOn: boolean;
  private readonly redirectTo: string | null;

  constructor(
    private readonly inner: IEmailPort,
    sandboxEnv: string | undefined,
    sandboxEmail: string | undefined,
  ) {
    this.sandboxOn = sandboxEnv === 'true';
    this.redirectTo = sandboxEmail && sandboxEmail.trim() ? sandboxEmail.trim() : null;
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    // Case 1: SANDBOX=true — suppress all delivery.
    if (this.sandboxOn) {
      this.logger.warn('[email] SANDBOX on — skipped');
      return { id: null };
    }

    // Case 2: SANDBOX != 'true' but SANDBOX_EMAIL is set — redirect.
    if (this.redirectTo !== null) {
      this.logger.warn('[email] redirected to SANDBOX_EMAIL');
      return this.inner.send({ ...input, to: this.redirectTo });
    }

    // Case 3: No sandbox, no redirect — send to real recipient.
    return this.inner.send(input);
  }
}
