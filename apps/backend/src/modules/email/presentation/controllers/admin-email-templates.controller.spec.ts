import { Test, TestingModule } from '@nestjs/testing';
import { AdminEmailTemplatesController } from './admin-email-templates.controller';
import { ListEmailTemplatesUseCase } from '../../application/use-cases/list-email-templates.use-case';
import type { EmailTemplateSummary } from '../../application/use-cases/list-email-templates.use-case';
import { GetEmailTemplateUseCase } from '../../application/use-cases/get-email-template.use-case';
import type { EmailTemplateDetail } from '../../application/use-cases/get-email-template.use-case';
import { UpdateEmailTemplateUseCase } from '../../application/use-cases/update-email-template.use-case';
import { EmailTemplateAdminNotFoundError } from '../../domain/errors/email-template-admin-not-found.error';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUMMARY_FIXTURE: EmailTemplateSummary = {
  name: 'invoice',
  subject: 'Factura {{invoiceNumber}}',
  description: 'Invoice template',
  isActive: true,
  updatedAt: new Date('2026-02-01'),
};

const DETAIL_FIXTURE: EmailTemplateDetail = {
  name: 'invoice',
  subject: 'Factura {{invoiceNumber}}',
  html: '<p>{{doctorName}}</p>',
  text: null,
  description: 'Invoice template',
  isActive: true,
  updatedAt: new Date('2026-02-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminEmailTemplatesController', () => {
  let controller: AdminEmailTemplatesController;
  let listUseCase: { execute: jest.Mock };
  let getUseCase: { execute: jest.Mock };
  let updateUseCase: { execute: jest.Mock };

  beforeEach(async () => {
    listUseCase = { execute: jest.fn() };
    getUseCase = { execute: jest.fn() };
    updateUseCase = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminEmailTemplatesController],
      providers: [
        { provide: ListEmailTemplatesUseCase, useValue: listUseCase },
        { provide: GetEmailTemplateUseCase, useValue: getUseCase },
        { provide: UpdateEmailTemplateUseCase, useValue: updateUseCase },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminEmailTemplatesController>(AdminEmailTemplatesController);
  });

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------

  describe('list()', () => {
    it('returns { success: true, data: summaries }', async () => {
      listUseCase.execute.mockResolvedValue([SUMMARY_FIXTURE]);

      const response = await controller.list();

      expect(response).toEqual({ success: true, data: [SUMMARY_FIXTURE] });
    });

    it('returns empty data array when no templates', async () => {
      listUseCase.execute.mockResolvedValue([]);

      const response = await controller.list();

      expect(response).toEqual({ success: true, data: [] });
    });

    it('delegates to ListEmailTemplatesUseCase.execute()', async () => {
      listUseCase.execute.mockResolvedValue([]);

      await controller.list();

      expect(listUseCase.execute).toHaveBeenCalledTimes(1);
    });

    it('response data does not contain html or text fields', async () => {
      listUseCase.execute.mockResolvedValue([SUMMARY_FIXTURE]);

      const response = await controller.list();

      expect(response.data[0]).not.toHaveProperty('html');
      expect(response.data[0]).not.toHaveProperty('text');
    });
  });

  // -------------------------------------------------------------------------
  // GET /:name
  // -------------------------------------------------------------------------

  describe('getOne()', () => {
    it('returns { success: true, data: detail } for an existing template', async () => {
      getUseCase.execute.mockResolvedValue(DETAIL_FIXTURE);

      const response = await controller.getOne('invoice');

      expect(response).toEqual({ success: true, data: DETAIL_FIXTURE });
    });

    it('passes the name param to GetEmailTemplateUseCase.execute()', async () => {
      getUseCase.execute.mockResolvedValue(DETAIL_FIXTURE);

      await controller.getOne('welcome');

      expect(getUseCase.execute).toHaveBeenCalledWith('welcome');
    });

    it('response data contains html and text', async () => {
      getUseCase.execute.mockResolvedValue(DETAIL_FIXTURE);

      const response = await controller.getOne('invoice');

      expect(response.data).toHaveProperty('html');
      expect(response.data).toHaveProperty('text');
    });

    it('propagates EmailTemplateAdminNotFoundError (404) for unknown name', async () => {
      getUseCase.execute.mockRejectedValue(new EmailTemplateAdminNotFoundError('unknown'));

      await expect(controller.getOne('unknown')).rejects.toThrow(EmailTemplateAdminNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:name
  // -------------------------------------------------------------------------

  describe('update()', () => {
    it('returns { success: true, data: detail } on successful update', async () => {
      const updated = { ...DETAIL_FIXTURE, subject: 'New subject' };
      updateUseCase.execute.mockResolvedValue(updated);

      const response = await controller.update('invoice', { subject: 'New subject' });

      expect(response).toEqual({ success: true, data: updated });
    });

    it('passes name and mapped fields to UpdateEmailTemplateUseCase.execute()', async () => {
      updateUseCase.execute.mockResolvedValue(DETAIL_FIXTURE);

      await controller.update('invoice', {
        subject: 'Updated',
        html: '<b>bold</b>',
        is_active: false,
      });

      expect(updateUseCase.execute).toHaveBeenCalledWith('invoice', {
        subject: 'Updated',
        html: '<b>bold</b>',
        text: undefined,
        isActive: false,
      });
    });

    it('maps is_active (snake_case DTO) to isActive (camelCase use-case)', async () => {
      updateUseCase.execute.mockResolvedValue(DETAIL_FIXTURE);

      await controller.update('invoice', { is_active: true });

      expect(updateUseCase.execute).toHaveBeenCalledWith(
        'invoice',
        expect.objectContaining({ isActive: true }),
      );
    });

    it('propagates EmailTemplateAdminNotFoundError (404) for unknown name', async () => {
      updateUseCase.execute.mockRejectedValue(new EmailTemplateAdminNotFoundError('ghost'));

      await expect(controller.update('ghost', { subject: 'X' })).rejects.toThrow(
        EmailTemplateAdminNotFoundError,
      );
    });

    it('passes text: null when dto.text is null', async () => {
      updateUseCase.execute.mockResolvedValue(DETAIL_FIXTURE);

      await controller.update('invoice', { text: null });

      expect(updateUseCase.execute).toHaveBeenCalledWith(
        'invoice',
        expect.objectContaining({ text: null }),
      );
    });
  });
});
