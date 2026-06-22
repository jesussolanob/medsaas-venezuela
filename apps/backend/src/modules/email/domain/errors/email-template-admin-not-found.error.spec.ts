import { EmailTemplateAdminNotFoundError } from './email-template-admin-not-found.error';
import { DomainError } from '../../../../domain/errors/domain.error';

describe('EmailTemplateAdminNotFoundError', () => {
  it('is a DomainError', () => {
    const error = new EmailTemplateAdminNotFoundError('invoice');
    expect(error).toBeInstanceOf(DomainError);
  });

  it('has the correct code', () => {
    const error = new EmailTemplateAdminNotFoundError('invoice');
    expect(error.code).toBe('EMAIL_TEMPLATE_NOT_FOUND');
  });

  it('has httpStatus 404', () => {
    const error = new EmailTemplateAdminNotFoundError('invoice');
    expect(error.httpStatus).toBe(404);
  });

  it('includes the template name in the message', () => {
    const error = new EmailTemplateAdminNotFoundError('reminder_24h');
    expect(error.message).toContain('reminder_24h');
  });

  it('is an instance of Error', () => {
    const error = new EmailTemplateAdminNotFoundError('invoice');
    expect(error).toBeInstanceOf(Error);
  });
});
