import { ListEmailTemplatesUseCase } from './list-email-templates.use-case';
import { EmailTemplate } from '../../domain/entities/email-template.entity';
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

describe('ListEmailTemplatesUseCase', () => {
  it('returns an empty array when there are no templates', async () => {
    const repo = makeRepo([]);
    const useCase = new ListEmailTemplatesUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });

  it('calls findAll on the repository', async () => {
    const repo = makeRepo([]);
    const useCase = new ListEmailTemplatesUseCase(repo);

    await useCase.execute();

    expect(repo.findAll).toHaveBeenCalledTimes(1);
  });

  it('maps templates to summary shape without html or text', async () => {
    const template = makeTemplate();
    const repo = makeRepo([template]);
    const useCase = new ListEmailTemplatesUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveLength(1);
    expect(result[0]!).toEqual({
      name: 'invoice',
      subject: 'Factura {{invoiceNumber}}',
      description: 'Invoice template',
      isActive: true,
      updatedAt: new Date('2026-02-01'),
    });
    expect(result[0]!).not.toHaveProperty('html');
    expect(result[0]!).not.toHaveProperty('text');
  });

  it('preserves the order returned by the repository', async () => {
    const t1 = makeTemplate({ id: 'a', name: 'appointment_confirmed', subject: 'Cita confirmada' });
    const t2 = makeTemplate({ id: 'b', name: 'welcome', subject: 'Bienvenido' });
    const repo = makeRepo([t1, t2]);
    const useCase = new ListEmailTemplatesUseCase(repo);

    const result = await useCase.execute();

    expect(result[0]!.name).toBe('appointment_confirmed');
    expect(result[1]!.name).toBe('welcome');
  });

  it('includes inactive templates in the listing', async () => {
    const inactive = makeTemplate({ isActive: false });
    const repo = makeRepo([inactive]);
    const useCase = new ListEmailTemplatesUseCase(repo);

    const result = await useCase.execute();

    expect(result[0]!.isActive).toBe(false);
  });

  it('maps null description correctly', async () => {
    const t = makeTemplate({ description: null });
    const repo = makeRepo([t]);
    const useCase = new ListEmailTemplatesUseCase(repo);

    const result = await useCase.execute();

    expect(result[0]!.description).toBeNull();
  });
});
