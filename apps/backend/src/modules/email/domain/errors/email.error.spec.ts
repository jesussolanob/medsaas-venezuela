import { EmailSendError } from './email.error';
import { DomainError } from '../../../../domain/errors/domain.error';

describe('EmailSendError', () => {
  it('extends DomainError', () => {
    const error = new EmailSendError();
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
  });

  it('has the correct error code', () => {
    const error = new EmailSendError();
    expect(error.code).toBe('EMAIL_SEND_FAILED');
  });

  it('has HTTP 502 status', () => {
    const error = new EmailSendError();
    expect(error.httpStatus).toBe(502);
  });

  it('uses a default message when no cause is provided', () => {
    const error = new EmailSendError();
    expect(error.message).toBe('No se pudo enviar el correo');
  });

  it('includes the cause in the message when provided', () => {
    const error = new EmailSendError('invalid_api_key');
    expect(error.message).toBe('No se pudo enviar el correo: invalid_api_key');
  });

  it('has the correct name matching the class', () => {
    const error = new EmailSendError();
    expect(error.name).toBe('EmailSendError');
  });

  it('leaves detail null when none is provided', () => {
    expect(new EmailSendError('invalid_api_key').detail).toBeNull();
  });

  it('keeps the raw provider text OUT of the message and only in detail', () => {
    // Arrange: Resend mete la dirección rechazada adentro del texto del error.
    const crudo = 'The paciente@ejemplo.com address is not verified';

    // Act
    const error = new EmailSendError('validation_error (403)', crudo);

    // Assert: `message` es lo que los llamadores interpolan en sus logs, así que
    // la dirección NO puede estar ahí; el texto completo queda en `detail`, que
    // solo se guarda en email_send_log.
    expect(error.message).not.toContain('paciente@ejemplo.com');
    expect(error.message).toBe('No se pudo enviar el correo: validation_error (403)');
    expect(error.detail).toBe(crudo);
  });
});
