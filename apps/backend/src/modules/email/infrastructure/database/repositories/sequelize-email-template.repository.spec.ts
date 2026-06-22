import { SequelizeEmailTemplateRepository } from './sequelize-email-template.repository';
import { EmailTemplate } from '../../../domain/entities/email-template.entity';
import { EmailTemplateNotFoundError } from '../../../domain/errors/email-template-not-found.error';
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
    update: jest.fn().mockImplementation(function (
      this: EmailTemplateModel,
      patch: Partial<EmailTemplateModel>,
    ) {
      Object.assign(this, patch);
      return Promise.resolve(this);
    }),
    ...overrides,
  } as unknown as EmailTemplateModel;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SequelizeEmailTemplateRepository', () => {
  let mockModel: {
    findOne: jest.MockedFunction<(typeof EmailTemplateModel)['findOne']>;
    findAll: jest.MockedFunction<(typeof EmailTemplateModel)['findAll']>;
  };
  let repo: SequelizeEmailTemplateRepository;

  beforeEach(() => {
    mockModel = {
      findOne: jest.fn(),
      findAll: jest.fn(),
    };

    repo = new SequelizeEmailTemplateRepository(mockModel as unknown as typeof EmailTemplateModel);
  });

  // -------------------------------------------------------------------------
  // findByName
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------

  describe('findAll', () => {
    it('queries with order name ASC', async () => {
      mockModel.findAll.mockResolvedValue([]);

      await repo.findAll();

      expect(mockModel.findAll).toHaveBeenCalledWith({
        order: [['name', 'ASC']],
      });
    });

    it('returns empty array when no rows', async () => {
      mockModel.findAll.mockResolvedValue([]);

      const result = await repo.findAll();
      expect(result).toEqual([]);
    });

    it('maps all rows to domain entities ordered as received', async () => {
      const rows = [
        makeModelRow({ id: 'tpl-1', name: 'invoice' }),
        makeModelRow({ id: 'tpl-2', name: 'welcome', subject: 'Bienvenido' }),
      ];
      mockModel.findAll.mockResolvedValue(rows);

      const result = await repo.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]!).toBeInstanceOf(EmailTemplate);
      expect(result[0]!.name).toBe('invoice');
      expect(result[1]!.name).toBe('welcome');
      expect(result[1]!.subject).toBe('Bienvenido');
    });

    it('includes inactive templates', async () => {
      const rows = [makeModelRow({ isActive: false })];
      mockModel.findAll.mockResolvedValue(rows);

      const result = await repo.findAll();
      expect(result[0]!.isActive).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('throws EmailTemplateNotFoundError when template does not exist', async () => {
      mockModel.findOne.mockResolvedValue(null);

      await expect(repo.update('nonexistent', { subject: 'New' })).rejects.toThrow(
        EmailTemplateNotFoundError,
      );
    });

    it('finds template by name without filtering by isActive', async () => {
      const row = makeModelRow();
      mockModel.findOne.mockResolvedValue(row);

      await repo.update('invoice', { subject: 'Updated subject' });

      expect(mockModel.findOne).toHaveBeenCalledWith({ where: { name: 'invoice' } });
    });

    it('calls row.update with only the provided fields', async () => {
      const row = makeModelRow();
      mockModel.findOne.mockResolvedValue(row);

      await repo.update('invoice', { subject: 'New subject' });

      expect(row.update).toHaveBeenCalledWith({ subject: 'New subject' });
    });

    it('updates html when provided', async () => {
      const row = makeModelRow();
      mockModel.findOne.mockResolvedValue(row);

      await repo.update('invoice', { html: '<b>hello</b>' });

      expect(row.update).toHaveBeenCalledWith({ html: '<b>hello</b>' });
    });

    it('updates text to null when explicitly set', async () => {
      const row = makeModelRow({ text: 'old text' });
      mockModel.findOne.mockResolvedValue(row);

      await repo.update('invoice', { text: null });

      expect(row.update).toHaveBeenCalledWith({ text: null });
    });

    it('updates isActive when provided', async () => {
      const row = makeModelRow();
      mockModel.findOne.mockResolvedValue(row);

      await repo.update('invoice', { isActive: false });

      expect(row.update).toHaveBeenCalledWith({ isActive: false });
    });

    it('does not include text key when text is not provided', async () => {
      const row = makeModelRow();
      mockModel.findOne.mockResolvedValue(row);

      await repo.update('invoice', { subject: 'Only subject' });

      const callArg = (row.update as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(Object.keys(callArg)).not.toContain('text');
    });

    it('returns the updated domain entity', async () => {
      const row = makeModelRow();
      mockModel.findOne.mockResolvedValue(row);

      const result = await repo.update('invoice', { subject: 'Updated' });

      expect(result).toBeInstanceOf(EmailTemplate);
      expect(result.name).toBe('invoice');
    });
  });
});
