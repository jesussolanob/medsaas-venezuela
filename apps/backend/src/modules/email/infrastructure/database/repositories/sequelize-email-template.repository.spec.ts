import { SequelizeEmailTemplateRepository } from './sequelize-email-template.repository';
import { EmailTemplate } from '../../../domain/entities/email-template.entity';
import type { EmailTemplateModel } from '../models/email-template.model';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModelRow(overrides: Partial<EmailTemplateModel> = {}): EmailTemplateModel {
  return {
    id: 'tpl-uuid-1',
    name: 'invoice',
    subject: 'Factura {{invoiceNumber}}',
    html: '<p>{{doctorName}}</p>',
    text: null,
    description: 'Invoice template',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as EmailTemplateModel;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SequelizeEmailTemplateRepository', () => {
  let mockModel: { findOne: jest.MockedFunction<typeof EmailTemplateModel['findOne']> };
  let repo: SequelizeEmailTemplateRepository;

  beforeEach(() => {
    mockModel = {
      findOne: jest.fn(),
    };

    repo = new SequelizeEmailTemplateRepository(
      mockModel as unknown as typeof EmailTemplateModel,
    );
  });

  describe('findByName', () => {
    it('queries by name and isActive=true', async () => {
      mockModel.findOne.mockResolvedValue(null);

      await repo.findByName('invoice');

      expect(mockModel.findOne).toHaveBeenCalledWith({
        where: { name: 'invoice', isActive: true },
      });
    });

    it('returns null when no row found', async () => {
      mockModel.findOne.mockResolvedValue(null);

      const result = await repo.findByName('missing');
      expect(result).toBeNull();
    });

    it('maps a row to an EmailTemplate domain entity', async () => {
      mockModel.findOne.mockResolvedValue(makeModelRow());

      const result = await repo.findByName('invoice');

      expect(result).toBeInstanceOf(EmailTemplate);
      expect(result!.id).toBe('tpl-uuid-1');
      expect(result!.name).toBe('invoice');
      expect(result!.subject).toBe('Factura {{invoiceNumber}}');
      expect(result!.html).toBe('<p>{{doctorName}}</p>');
      expect(result!.text).toBeNull();
      expect(result!.description).toBe('Invoice template');
      expect(result!.isActive).toBe(true);
    });

    it('maps text field when present', async () => {
      mockModel.findOne.mockResolvedValue(makeModelRow({ text: 'plain text' }));

      const result = await repo.findByName('invoice');

      expect(result!.text).toBe('plain text');
    });
  });
});
