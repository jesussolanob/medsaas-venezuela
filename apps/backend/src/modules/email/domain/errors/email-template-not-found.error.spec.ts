import { EmailTemplateNotFoundError } from './email-template-not-found.error';
import { DomainError } from '../../../../domain/errors/domain.error';

describe('EmailTemplateNotFoundError', () => {
  it('is a DomainError', () => {
    const error = new EmailTemplateNotFoundError('invoice');
    expect(error).toBeInstanceOf(DomainError);
  });

  it('has the correct code', () => {
    const error = new EmailTemplateNotFoundError('invoice');
    expect(error.code).toBe('EMAIL_TEMPLATE_NOT_FOUND');
  });

  it('has httpStatus 500', () => {
    const error = new EmailTemplateNotFoundError('invoice');
    expect(error.httpStatus).toBe(500);
  });

  it('includes the template name in the message', () => {
    const error = new EmailTemplateNotFoundError('reminder');
    expect(error.message).toContain('reminder');
  });
});
