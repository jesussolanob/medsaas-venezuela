import { EmailTemplate } from './email-template.entity';

function makeTemplate(overrides: Partial<Parameters<typeof EmailTemplate.create>[0]> = {}): EmailTemplate {
  return EmailTemplate.create({
    id: 'tpl-1',
    name: 'invoice',
    subject: 'Factura {{invoiceNumber}}',
    html: '<p>{{doctorName}}</p>',
    text: null,
    description: 'Invoice template',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('EmailTemplate entity', () => {
  it('creates a template with all properties', () => {
    const tpl = makeTemplate();

    expect(tpl.id).toBe('tpl-1');
    expect(tpl.name).toBe('invoice');
    expect(tpl.subject).toBe('Factura {{invoiceNumber}}');
    expect(tpl.html).toBe('<p>{{doctorName}}</p>');
    expect(tpl.text).toBeNull();
    expect(tpl.description).toBe('Invoice template');
    expect(tpl.isActive).toBe(true);
    expect(tpl.createdAt).toEqual(new Date('2026-01-01'));
    expect(tpl.updatedAt).toEqual(new Date('2026-01-01'));
  });

  it('creates a template with text fallback', () => {
    const tpl = makeTemplate({ text: 'Plain text version' });
    expect(tpl.text).toBe('Plain text version');
  });

  it('creates an inactive template', () => {
    const tpl = makeTemplate({ isActive: false });
    expect(tpl.isActive).toBe(false);
  });

  it('creates a template with null description', () => {
    const tpl = makeTemplate({ description: null });
    expect(tpl.description).toBeNull();
  });
});
