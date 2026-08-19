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
});
