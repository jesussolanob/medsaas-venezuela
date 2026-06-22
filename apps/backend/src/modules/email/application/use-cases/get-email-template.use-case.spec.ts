import { GetEmailTemplateUseCase } from './get-email-template.use-case';
import { EmailTemplate } from '../../domain/entities/email-template.entity';
import { EmailTemplateAdminNotFoundError } from '../../domain/errors/email-template-admin-not-found.error';
import type { IEmailTemplateRepository } from '../../domain/repositories/email-template.repository';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplate(
  overrides: Partial<Parameters<typeof EmailTemplate.create>[0]> = {},
): EmailTemplate {
  return EmailTemplate.create({
    id: 'tpl-uuid-1',
    name: 'invoice',
    subject: 'Factura {{invoiceNumber}}',
    html: '<p>{{doctorName}}</p>',
    text: 'plain text fallback',
    description: 'Invoice template',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-02-01'),
    ...overrides,
  });
}

function makeRepo(templates: EmailTemplate[]): IEmailTemplateRepository {
  return {
    findByName: jest.fn(),
    findAll: jest.fn().mockResolvedValue(templates),
    update: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GetEmailTemplateUseCase', () => {
  it('returns the full detail for an existing template', async () => {
    const template = makeTemplate();
    const repo = makeRepo([template]);
    const useCase = new GetEmailTemplateUseCase(repo);

    const result = await useCase.execute('invoice');

    expect(result).toEqual({
      name: 'invoice',
      subject: 'Factura {{invoiceNumber}}',
      html: '<p>{{doctorName}}</p>',
      text: 'plain text fallback',
      description: 'Invoice template',
      isActive: true,
      updatedAt: new Date('2026-02-01'),
    });
  });

  it('includes html and text in the response', async () => {
    const template = makeTemplate({ html: '<h1>Invoice</h1>', text: 'Invoice plain' });
    const repo = makeRepo([template]);
    const useCase = new GetEmailTemplateUseCase(repo);

    const result = await useCase.execute('invoice');

    expect(result.html).toBe('<h1>Invoice</h1>');
    expect(result.text).toBe('Invoice plain');
  });

  it('returns null text when template has no text version', async () => {
    const template = makeTemplate({ text: null });
    const repo = makeRepo([template]);
    const useCase = new GetEmailTemplateUseCase(repo);

    const result = await useCase.execute('invoice');

    expect(result.text).toBeNull();
  });

  it('throws EmailTemplateAdminNotFoundError when template does not exist', async () => {
    const repo = makeRepo([]);
    const useCase = new GetEmailTemplateUseCase(repo);

    await expect(useCase.execute('nonexistent')).rejects.toThrow(EmailTemplateAdminNotFoundError);
  });

  it('thrown error has HTTP status 404', async () => {
    const repo = makeRepo([]);
    const useCase = new GetEmailTemplateUseCase(repo);

    try {
      await useCase.execute('nonexistent');
      fail('Expected error to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EmailTemplateAdminNotFoundError);
      expect((err as EmailTemplateAdminNotFoundError).httpStatus).toBe(404);
    }
  });

  it('thrown error message contains the template name', async () => {
    const repo = makeRepo([]);
    const useCase = new GetEmailTemplateUseCase(repo);

    try {
      await useCase.execute('welcome');
      fail('Expected error to be thrown');
    } catch (err) {
      expect((err as Error).message).toContain('welcome');
    }
  });

  it('can retrieve an inactive template', async () => {
    const template = makeTemplate({ isActive: false });
    const repo = makeRepo([template]);
    const useCase = new GetEmailTemplateUseCase(repo);

    const result = await useCase.execute('invoice');

    expect(result.isActive).toBe(false);
  });

  it('calls findAll on the repository', async () => {
    const repo = makeRepo([makeTemplate()]);
    const useCase = new GetEmailTemplateUseCase(repo);

    await useCase.execute('invoice');

    expect(repo.findAll).toHaveBeenCalledTimes(1);
  });
});
