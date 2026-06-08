import type { ConfigService } from '@nestjs/config';
import type { IEmailPort } from '../../application/ports/email.port';
import { ResendEmailAdapter } from './resend-email.adapter';
import { NoopEmailAdapter } from './noop-email.adapter';

export type EmailDriver = 'resend' | 'noop';

/**
 * Returns the correct email adapter instance based on the EMAIL_DRIVER
 * environment variable.
 *
 * Default: 'noop' (fail-safe — no crashes if EMAIL_DRIVER is unset).
 * Set EMAIL_DRIVER=resend in development / production to enable real delivery.
 */
export function createEmailAdapter(config: ConfigService): IEmailPort {
  const driver = config.get<string>('EMAIL_DRIVER', 'noop') as EmailDriver;

  if (driver === 'resend') {
    return new ResendEmailAdapter(config);
  }

  return new NoopEmailAdapter();
}
