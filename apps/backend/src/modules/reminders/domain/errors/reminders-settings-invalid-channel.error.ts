import { DomainError } from '../../../../domain/errors/domain.error';

export class ReminderSettingsInvalidChannelError extends DomainError {
  readonly code = 'REMINDER_SETTINGS_INVALID_CHANNEL';
  override readonly httpStatus = 400;

  constructor(channel: string) {
    super(`Canal de recordatorio inválido: "${channel}". Debe ser whatsapp, email o ambos`);
  }
}
