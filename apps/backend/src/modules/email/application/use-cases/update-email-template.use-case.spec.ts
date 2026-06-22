import { UpdateEmailTemplateUseCase } from './update-email-template.use-case';
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
    text: null,
    description: 'Invoice template',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-02-01'),
    ...overrides,
  });
}

function makeRepo(
  templates: EmailTemplate[],
  updatedTemplate?: EmailTemplate,
): IEmailTemplateRepository {
  return {
    findByName: jest.fn(),
    findAll: jest.fn().mockResolvedValue(templates),
    update: jest.fn().mockResolvedValue(updatedTemplate ?? templates[0]),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UpdateEmailTemplateUseCase', () => {
  it('throws EmailTemplateAdminNotFoundError when template does not exist', async () => {
    const repo = makeRepo([]);
    const useCase = new UpdateEmailTemplateUseCase(repo);

    await expect(useCase.execute('nonexistent', { subject: 'New' })).rejects.toThrow(
      EmailTemplateAdminNotFoundError,
    );
  });

  it('thrown error has HTTP status 404', async () => {
    const repo = makeRepo([]);
    const useCase = new UpdateEmailTemplateUseCase(repo);

    try {
      await useCase.execute('nonexistent', { subject: 'New' });
      fail('Expected error to be thrown');
    } catch (err) {
      expect((err as EmailTemplateAdminNotFoundError).httpStatus).toBe(404);
    }
  });

  it('does not call repo.update when template does not exist', async () => {
    const repo = makeRepo([]);
    const useCase = new UpdateEmailTemplateUseCase(repo);

    await expect(useCase.execute('nonexistent', { subject: 'New' })).rejects.toThrow();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('calls repo.update with the correct name and fields', async () => {
    const template = makeTemplate();
    const repo = makeRepo([template]);
    const useCase = new UpdateEmailTemplateUseCase(repo);

    await useCase.execute('invoice', { subject: 'Updated subject' });

    expect(repo.update).toHaveBeenCalledWith(
      'invoice',
      expect.objectContaining({
        subject: 'Updated subject',
      }),
    );
  });

  it('passes html to the repository', async () => {
    const template = makeTemplate();
    const repo = makeRepo([template]);
    const useCase = new UpdateEmailTemplateUseCase(repo);

    await useCase.execute('invoice', { html: '<b>new</b>' });

    expect(repo.update).toHaveBeenCalledWith(
      'invoice',
      expect.objectContaining({
        html: '<b>new</b>',
      }),
    );
  });

  it('passes text: null to the repository when explicitly set', async () => {
    const template = makeTemplate({ text: 'old' });
    const updatedTemplate = makeTemplate({ text: null });
    const repo = makeRepo([template], updatedTemplate);
    const useCase = new UpdateEmailTemplateUseCase(repo);

    await useCase.execute('invoice', { text: null });

    expect(repo.update).toHaveBeenCalledWith(
      'invoice',
      expect.objectContaining({
        text: null,
      }),
    );
  });

  it('passes isActive to the repository', async () => {
    const template = makeTemplate();
    const updatedTemplate = makeTemplate({ isActive: false });
    const repo = makeRepo([template], updatedTemplate);
    const useCase = new UpdateEmailTemplateUseCase(repo);

    await useCase.execute('invoice', { isActive: false });

    expect(repo.update).toHaveBeenCalledWith(
      'invoice',
      expect.objectContaining({
        isActive: false,
      }),
    );
  });

  it('returns the updated template as full detail', async () => {
    const template = makeTemplate();
    const updatedTemplate = makeTemplate({ subject: 'Updated subject' });
    const repo = makeRepo([template], updatedTemplate);
    const useCase = new UpdateEmailTemplateUseCase(repo);

    const result = await useCase.execute('invoice', { subject: 'Updated subject' });

    expect(result).toEqual({
      name: 'invoice',
      subject: 'Updated subject',
      html: '<p>{{doctorName}}</p>',
      text: null,
      description: 'Invoice template',
      isActive: true,
      updatedAt: new Date('2026-02-01'),
    });
  });

  it('response includes html and text fields', async () => {
    const template = makeTemplate({ html: '<b>html</b>', text: 'plain' });
    const repo = makeRepo([template], template);
    const useCase = new UpdateEmailTemplateUseCase(repo);

    const result = await useCase.execute('invoice', { subject: 'S' });

    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('text');
  });

  it('calls findAll before updating to verify existence', async () => {
    const template = makeTemplate();
    const repo = makeRepo([template]);
    const useCase = new UpdateEmailTemplateUseCase(repo);

    await useCase.execute('invoice', { subject: 'New' });

    expect(repo.findAll).toHaveBeenCalledTimes(1);
  });
});
