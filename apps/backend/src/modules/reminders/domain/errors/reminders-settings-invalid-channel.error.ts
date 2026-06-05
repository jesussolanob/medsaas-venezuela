import { DomainError } from '../../../../domain/errors/domain.error';

export class ReminderSettingsInvalidChannelError extends DomainError {
  readonly code = 'REMINDER_SETTINGS_INVALID_CHANNEL';
  override readonly httpStatus = 400;

  constructor(channel: string) {
    super(`Invalid reminder channel: "${channel}". Must be one of: whatsapp, email, both`);
  }
}
